"""Preview a pinned, minimal completion/SSE correction for the existing Acer adapter.

Reads only by default. --output creates a private candidate, never modifies the
source or controls a service. Productive backup, restore proof and approval
remain separate prerequisites. No model-specific behavior is introduced.
"""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import stat

SOURCE_SHA256 = "cdf5d6768d8fffb9e3d1d0f4b08db9784a5ce5b432003f4cf16d4f3a970c8b81"
REASON_NAME = "_netaigis_done_reason"


def rewrite(source, expected_sha256=SOURCE_SHA256):
    if hashlib.sha256(source).hexdigest() != expected_sha256:
        raise ValueError("Adapter source changed; no candidate was produced")
    tree = ast.parse(source)
    functions = {n.name: n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    if not {"completion", "sse_stream"} <= functions.keys():
        raise ValueError("Expected formatter functions missing")
    lines = source.splitlines(keepends=True)

    def offset(line, column):
        return sum(map(len, lines[:line - 1])) + column

    def finish_expression(function):
        candidates = []
        for node in ast.walk(function):
            if isinstance(node, ast.IfExp):
                labels = {n.value for n in ast.walk(node) if isinstance(n, ast.Constant) and isinstance(n.value, str)}
                if labels == {"stop", "tool_calls"}:
                    candidates.append(node)
        if len(candidates) != 1:
            raise ValueError("Formatter finish expression changed")
        node = candidates[0]
        return node, offset(node.lineno, node.col_offset), offset(node.end_lineno, node.end_col_offset)

    def indentation(node):
        prefix = lines[node.lineno - 1][:node.col_offset]
        if prefix.strip():
            raise ValueError("Unsupported inline formatter statement")
        return prefix

    edits = []
    function = functions["completion"]
    _, start, end = finish_expression(function)
    response = function.args.args[0].arg
    edits.append((start, end, f'("length" if {response}.get("done_reason") == "length" else ('.encode() + source[start:end] + b'))'))

    function = functions["sse_stream"]
    if any(isinstance(n, ast.Name) and n.id == REASON_NAME for n in ast.walk(function)):
        raise ValueError("Formatter correction already present")
    parses = [n for n in ast.walk(function) if isinstance(n, ast.Assign) and len(n.targets) == 1
              and isinstance(n.targets[0], ast.Name) and isinstance(n.value, ast.Call)
              and isinstance(n.value.func, ast.Attribute) and isinstance(n.value.func.value, ast.Name)
              and n.value.func.value.id == "json" and n.value.func.attr == "loads"]
    if len(parses) != 1:
        raise ValueError("Streaming record parser changed")
    parse = parses[0]
    record = parse.targets[0].id
    insert = offset(parse.end_lineno, len(lines[parse.end_lineno - 1]))
    edits.append((insert, insert, indentation(parse) + f'{REASON_NAME} = {record}.get("done_reason", {REASON_NAME})\n'.encode()))
    statements = function.body
    if statements and isinstance(statements[0], ast.Expr) and isinstance(statements[0].value, ast.Constant) and isinstance(statements[0].value.value, str):
        statements = statements[1:]
    first = statements[0]
    insert = offset(first.lineno, first.col_offset)
    edits.append((insert, insert, f'{REASON_NAME} = None\n'.encode() + indentation(first)))
    _, start, end = finish_expression(function)
    edits.append((start, end, f'("length" if {REASON_NAME} == "length" else ('.encode() + source[start:end] + b'))'))

    candidate = source
    for start, end, replacement in sorted(edits, key=lambda edit: edit[0], reverse=True):
        candidate = candidate[:start] + replacement + candidate[end:]
    ast.parse(candidate)
    return candidate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    source = args.source.read_bytes()
    candidate = rewrite(source)
    if args.output:
        parent = args.output.parent
        if args.output.resolve() == args.source.resolve() or parent.is_symlink() or stat.S_IMODE(parent.stat().st_mode) & 0o077:
            raise SystemExit("Candidate needs a separate existing private directory")
        descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as target:
            target.write(candidate)
            target.flush()
            os.fsync(target.fileno())
    print(json.dumps({"source_sha256": hashlib.sha256(source).hexdigest(), "candidate_sha256": hashlib.sha256(candidate).hexdigest(),
                      "source_modified": False, "service_modified": False, "candidate_written": bool(args.output)}))


if __name__ == "__main__":
    main()
