"""Prepare configurable context tiers in the existing Coding-Agent tracker.

The deployed defaults stay unchanged until infrastructure configuration is
explicitly approved. No model, endpoint, service or storage changes here.
"""
import ast
import hashlib

SOURCE_SHA256 = "685a355e75d42902700792890eef1a2a4d7df8e8cfa797d5c264fd55e8875aa2"


def rewrite(source, expected_sha256=SOURCE_SHA256):
    if hashlib.sha256(source).hexdigest() != expected_sha256:
        raise ValueError("Context tracker changed; no candidate was produced")
    tree = ast.parse(source)
    if any(isinstance(n, ast.Name) and n.id.startswith("_netaigis_context_") for n in ast.walk(tree)):
        raise ValueError("Configurable context tiers already present")
    assignments = [n for n in tree.body if isinstance(n, ast.Assign) and len(n.targets) == 1
                   and isinstance(n.targets[0], ast.Name) and n.targets[0].id == "TIERS"]
    if len(assignments) != 1:
        raise ValueError("Context tier anchor changed")
    assignment = assignments[0]
    defaults = ast.literal_eval(assignment.value)
    if not isinstance(defaults, tuple) or not defaults or any(type(n) is not int or n <= 0 for n in defaults) or list(defaults) != sorted(set(defaults)):
        raise ValueError("Existing context tiers are invalid")
    limit_errors = [n for n in ast.walk(tree) if isinstance(n, ast.Constant)
                    and n.value == f"Context exceeds {defaults[-1]} tokens"]
    if len(limit_errors) != 1:
        raise ValueError("Context limit error anchor changed")
    helper = '''import os as _netaigis_context_os


def _netaigis_context_tiers(raw):
    if raw is None:
        return DEFAULTS
    if not isinstance(raw, str):
        raise ValueError("NETAIGIS_CONTEXT_TIERS must be a comma-separated token list")
    parts = [part.strip() for part in raw.split(",")]
    if not 1 <= len(parts) <= 64 or any(not part.isascii() or not part.isdecimal() for part in parts):
        raise ValueError("NETAIGIS_CONTEXT_TIERS must contain positive ascending integers")
    values = tuple(int(part) for part in parts)
    if any(value < 1 for value in values) or list(values) != sorted(set(values)):
        raise ValueError("NETAIGIS_CONTEXT_TIERS must contain positive ascending integers")
    return values


TIERS = _netaigis_context_tiers(_netaigis_context_os.environ.get("NETAIGIS_CONTEXT_TIERS"))
'''.replace("DEFAULTS", repr(defaults)).encode()
    lines = source.splitlines(keepends=True)

    def offset(node, end=False):
        line = node.end_lineno if end else node.lineno
        column = node.end_col_offset if end else node.col_offset
        return sum(map(len, lines[:line - 1])) + column

    error = limit_errors[0]
    edits = [(offset(assignment), offset(assignment, True), helper.rstrip(b"\n")),
             (offset(error), offset(error, True), b'f"Context exceeds {TIERS[-1]} tokens"')]
    candidate = source
    for start, end, value in sorted(edits, reverse=True):
        candidate = candidate[:start] + value + candidate[end:]
    ast.parse(candidate)
    compile(candidate, "verified-configurable-context-tracker", "exec")
    return candidate
