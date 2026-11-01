"""Prepare lossless reasoning-field forwarding for the existing native adapter.

No model names, routes, context sizes, source writes or service operations.
"""
import ast
import copy
import hashlib

SOURCE_SHA256 = "307497023baea81eabda77d96045c81fecc605a296748dc0ad163f7e01c4ffd9"


def rewrite(source, expected_sha256=SOURCE_SHA256):
    if hashlib.sha256(source).hexdigest() != expected_sha256:
        raise ValueError("Adapter source changed; no candidate was produced")
    tree = ast.parse(source)
    functions = {n.name: n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    if not {"completion", "sse_stream"} <= functions.keys():
        raise ValueError("Expected formatter functions missing")
    if any(isinstance(n, ast.Name) and n.id == "_netaigis_reasoning" for n in ast.walk(tree)):
        raise ValueError("Reasoning correction already present")
    lines = source.splitlines(keepends=True)
    edits = []

    def insert_after(node, addition):
        if lines[node.lineno - 1][:node.col_offset].strip():
            raise ValueError("Unsupported inline formatter statement")
        offset = sum(map(len, lines[:node.end_lineno]))
        indent = b" " * node.col_offset
        edits.append((offset, b"".join(indent + line + b"\n" for line in addition.encode().splitlines())))

    for name in ("completion", "sse_stream"):
        function = functions[name]
        assignments = [n for n in ast.walk(function) if isinstance(n, ast.Assign) and len(n.targets) == 1
                       and isinstance(n.targets[0], ast.Name) and n.targets[0].id == "msg"]
        if len(assignments) != 1:
            raise ValueError("Native message anchor changed")
        message = assignments[0]
        if not any(isinstance(n, ast.Constant) and n.value == "message" for n in ast.walk(message.value)):
            raise ValueError("Native message extraction changed")
        common = ('_netaigis_reasoning = msg.get("reasoning_content", msg.get("thinking"))\n'
                  'if _netaigis_reasoning is not None:\n'
                  '    if not isinstance(_netaigis_reasoning, str):\n'
                  '        raise ValueError("Native reasoning must be text")\n')
        if name == "completion":
            answers = [n for n in ast.walk(function) if isinstance(n, ast.Assign) and len(n.targets) == 1
                       and isinstance(n.targets[0], ast.Name) and n.targets[0].id == "answer" and isinstance(n.value, ast.Dict)]
            if len(answers) != 1 or answers[0].lineno <= message.lineno:
                raise ValueError("OpenAI message anchor changed")
            insert_after(answers[0], common + '    answer["reasoning_content"] = _netaigis_reasoning')
        else:
            def content_dict(node):
                return (isinstance(node, ast.Dict) and len(node.keys) == 1
                        and isinstance(node.keys[0], ast.Constant) and node.keys[0].value == "content")

            emissions = [n for n in ast.walk(function) if isinstance(n, ast.Yield) and isinstance(n.value, ast.Call)
                         and isinstance(n.value.func, ast.Name) and n.value.func.id == "emit"
                         and sum(content_dict(value) for value in ast.walk(n.value)) == 1]
            if len(emissions) != 1:
                raise ValueError("OpenAI delta anchor changed")
            # Preserve the actual formatter's chunk/serialization wrapper.
            emission = copy.deepcopy(emissions[0].value)
            delta = next(n for n in ast.walk(emission) if content_dict(n))
            delta.keys = [ast.Constant(value="reasoning_content")]
            delta.values = [ast.Name(id="_netaigis_reasoning", ctx=ast.Load())]
            insert_after(message, common + '    yield ' + ast.unparse(emission))
    candidate = source
    for offset, addition in sorted(edits, reverse=True):
        candidate = candidate[:offset] + addition + candidate[offset:]
    ast.parse(candidate)
    compile(candidate, "verified-reasoning-candidate", "exec")
    return candidate
