"""Prepare a byte-pinned streaming telemetry correction; never apply or restart."""
import ast
import hashlib

SOURCE_SHA256 = "307497023baea81eabda77d96045c81fecc605a296748dc0ad163f7e01c4ffd9"


def rewrite(source, expected_sha256=SOURCE_SHA256):
    if hashlib.sha256(source).hexdigest() != expected_sha256:
        raise ValueError("Adapter source changed")
    tree = ast.parse(source)
    functions = [n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "sse_stream"]
    if len(functions) != 1:
        raise ValueError("Streaming converter changed")
    function = functions[0]
    lines = source.splitlines(keepends=True)
    body = b"".join(lines[function.lineno - 1:function.end_lineno])
    if b"_netaigis_stream_usage" in body:
        raise ValueError("Streaming usage correction already present")
    target = b'            yield b"data: [DONE]\\n\\n"\n'
    if body.count(target) != 1 or b'if data.get("done"):' not in body:
        raise ValueError("Confirmed streaming completion changed")
    replacement = b'''            # Report only confirmed native counters, never invent missing usage.
            _netaigis_stream_usage = None
            _prompt = data.get("prompt_eval_count")
            _completion = data.get("eval_count")
            if type(_prompt) is int and type(_completion) is int and _prompt >= 0 and _completion >= 0:
                _netaigis_stream_usage = {
                    "prompt_tokens": _prompt,
                    "completion_tokens": _completion,
                    "total_tokens": _prompt + _completion,
                }
            if _netaigis_stream_usage is not None:
                _usage_chunk = chunk({})
                _usage_chunk["choices"] = []
                _usage_chunk["usage"] = _netaigis_stream_usage
                yield emit(_usage_chunk)

''' + target
    start = sum(map(len, lines[:function.lineno - 1]))
    offset = start + body.index(target)
    result = source[:offset] + replacement + source[offset + len(target):]
    ast.parse(result)
    return result
