"""Prepare the existing Acer router's native chat correction, without applying it.

Private source stays on its host. The byte-pinned rewriter preserves routing,
context growth, model selection and all other handlers. Productive application
requires a separate verified backup and approval for the router.
"""
import ast
import hashlib

SOURCE_SHA256 = "20a5c578fcbeb00afa3b2a92d930582c238e738526c8ffc20b098f67a2410e0c"

STREAM_HELPERS = '''
def _netaigis_native_frames(lines, model):
    """Convert confirmed OpenAI SSE events into native records, without history."""
    import json
    data = []
    data_size = 0
    calls = {}
    finish = None
    usage = {}
    for raw in lines:
        line = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        line = line.rstrip("\\r\\n")
        if line:
            if line.startswith("data:"):
                value = line[5:].lstrip(" ")
                data_size += len(value)
                if data_size > 8 * 1024 * 1024:
                    raise ValueError("Upstream event exceeds the protocol bound")
                data.append(value)
            continue
        if not data:
            continue
        payload = "\\n".join(data)
        data = []
        data_size = 0
        if payload == "[DONE]":
            if finish is None:
                raise ValueError("Upstream stream has no confirmed finish reason")
            message = {"role": "assistant", "content": ""}
            if calls:
                completed = []
                for index in sorted(calls):
                    call = calls[index]
                    fn = call["function"]
                    if not fn["name"]:
                        raise ValueError("Upstream tool has no name")
                    arguments = json.loads(fn["arguments"])
                    if not isinstance(arguments, dict):
                        raise ValueError("Upstream tool arguments must be an object")
                    completed.append({**call, "function": {**fn, "arguments": arguments}})
                message["tool_calls"] = completed
            yield {"model": model, "message": message, "done": True,
                   "done_reason": finish, "prompt_eval_count": usage.get("prompt_tokens", 0),
                   "eval_count": usage.get("completion_tokens", 0)}
            return
        event = json.loads(payload)
        if not isinstance(event, dict) or "error" in event:
            raise ValueError("Upstream returned an invalid streaming event")
        if isinstance(event.get("usage"), dict):
            usage = event["usage"]
        choices = event.get("choices", [])
        if not isinstance(choices, list) or len(choices) > 1:
            raise ValueError("Native chat requires one upstream choice")
        if not choices:
            continue
        choice = choices[0]
        if choice.get("index", 0) != 0 or finish is not None:
            raise ValueError("Unexpected upstream choice after completion")
        delta = choice.get("delta") or {}
        if not isinstance(delta, dict):
            raise ValueError("Invalid upstream delta")
        message = {"role": "assistant", "content": ""}
        visible = False
        for upstream, native in (("content", "content"), ("reasoning_content", "thinking")):
            value = delta.get(upstream)
            if value is not None:
                if not isinstance(value, str):
                    raise ValueError("Invalid upstream text delta")
                message[native] = value
                visible = visible or bool(value)
        for fragment in delta.get("tool_calls") or []:
            index = fragment.get("index")
            if type(index) is not int or index < 0:
                raise ValueError("Invalid upstream tool index")
            call = calls.setdefault(index, {"type": "function", "function": {"name": "", "arguments": ""}})
            if fragment.get("id"):
                if "id" in call and call["id"] != fragment["id"]:
                    raise ValueError("Upstream tool identity changed")
                call["id"] = fragment["id"]
            if fragment.get("type", "function") != "function":
                raise ValueError("Unsupported upstream tool type")
            fn = fragment.get("function") or {}
            for key in ("name", "arguments"):
                part = fn.get(key, "")
                if not isinstance(part, str):
                    raise ValueError("Invalid upstream tool fragment")
                call["function"][key] += part
        if visible or delta.get("role") == "assistant":
            yield {"model": model, "message": message, "done": False}
        reason = choice.get("finish_reason")
        if reason is not None:
            if reason not in ("stop", "length", "tool_calls", "content_filter"):
                raise ValueError("Unknown upstream finish reason")
            finish = reason
    raise ValueError("Upstream stream ended without a confirmed DONE event")


def _netaigis_ollama_stream(self, base, request):
    import json
    import urllib.request
    request = {**request, "stream": True, "stream_options": {"include_usage": True}}
    upstream = urllib.request.Request(base.rstrip("/") + "/v1/chat/completions",
                                      data=json.dumps(request).encode(),
                                      headers={"Content-Type": "application/json", "Accept": "text/event-stream"})
    # Open before committing response headers, so upstream HTTP errors remain errors.
    with urllib.request.urlopen(upstream, timeout=720) as response:
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        try:
            for record in _netaigis_native_frames(response, request["model"]):
                self.wfile.write((json.dumps(record, ensure_ascii=False) + "\\n").encode())
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            return
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            # No fabricated done record, private error text, or second HTTP response.
            try:
                self.wfile.write(b'{"error":"upstream_stream_incomplete"}\\n')
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
'''.lstrip()


def rewrite(source, expected_sha256=SOURCE_SHA256):
    if hashlib.sha256(source).hexdigest() != expected_sha256:
        raise ValueError("Router source changed; no candidate was produced")
    tree = ast.parse(source)
    if any(isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name.startswith("_netaigis_") for n in ast.walk(tree)):
        raise ValueError("Router protocol correction already present")
    classes = [n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "Handler"]
    if len(classes) != 1:
        raise ValueError("Router handler changed")
    handler = classes[0]
    methods = [n for n in handler.body if isinstance(n, ast.FunctionDef) and n.name == "do_ollama_chat"]
    if len(methods) != 1:
        raise ValueError("Native router handler changed")
    method = methods[0]
    lines = source.splitlines(keepends=True)

    def offset(line, column=0):
        return sum(map(len, lines[:line - 1])) + column

    def after(node, addition):
        indent = b" " * node.col_offset
        return (offset(node.end_lineno + 1), offset(node.end_lineno + 1),
                b"".join(indent + line + b"\n" for line in addition.encode().splitlines()))

    rejects = [n for n in method.body if isinstance(n, ast.If) and isinstance(n.test, ast.Call)
               and ast.unparse(n.test) == "payload.get('stream', False)"
               and len(n.body) == 1 and isinstance(n.body[0], ast.Raise)]
    requests = [n for n in method.body if isinstance(n, ast.Assign) and len(n.targets) == 1
                and isinstance(n.targets[0], ast.Name) and n.targets[0].id == "request" and isinstance(n.value, ast.Dict)]
    reservations = [n for n in ast.walk(method) if isinstance(n, ast.Call)
                    and isinstance(n.func, ast.Name) and n.func.id == "context_needed"
                    and len(n.args) == 2 and ast.unparse(n.args[0]) == "converted"
                    and isinstance(n.args[1], ast.Constant) and n.args[1].value == 4096]
    fetches = [n for n in ast.walk(method) if isinstance(n, ast.Assign) and isinstance(n.value, ast.Call)
               and isinstance(n.value.func, ast.Name) and n.value.func.id == "fetch_json"]
    if tuple(map(len, (rejects, requests, reservations, fetches))) != (1, 1, 1, 1):
        raise ValueError("Native protocol anchors changed")
    reject, request, reservation, fetch = rejects[0], requests[0], reservations[0].args[1], fetches[0]
    replacement = ('if type(payload.get("stream", False)) is not bool:\n'
                   + ' ' * (reject.col_offset + 4) + 'raise ValueError("stream must be a boolean")').encode()
    edits = [(offset(reject.lineno, reject.col_offset), offset(reject.end_lineno, reject.end_col_offset), replacement),
             after(request, 'reserve = opts.get("num_predict", 4096)\n'
                   'if type(reserve) is not int or not 1 <= reserve <= 131072:\n'
                   '    raise ValueError("num_predict must be a positive bounded integer")\n'
                   'if "num_predict" in opts:\n'
                   '    request["max_tokens"] = reserve'),
             (offset(reservation.lineno, reservation.col_offset), offset(reservation.end_lineno, reservation.end_col_offset), b"reserve"),
             (offset(fetch.lineno), offset(fetch.lineno), b" " * fetch.col_offset + b'if payload.get("stream") is True:\n'
              + b" " * (fetch.col_offset + 4) + b'return _netaigis_ollama_stream(self, CONFIG[scope]["url"], request)\n'),
             (offset(handler.lineno), offset(handler.lineno), STREAM_HELPERS.encode() + b"\n\n")]
    candidate = source
    for start, end, value in sorted(edits, key=lambda item: item[0], reverse=True):
        candidate = candidate[:start] + value + candidate[end:]
    ast.parse(candidate)
    compile(candidate, "verified-router-protocol-candidate", "exec")
    return candidate
