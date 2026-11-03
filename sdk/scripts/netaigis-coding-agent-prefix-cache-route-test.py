"""In-memory real-route regression on the existing Acer Python environment.

Reads the known current gateway/adapter; candidate is supplied on stdin. All
HTTP is intercepted by MockTransport/ASGITransport. No service or model access.
"""
import ast
import asyncio
import base64
import copy
import hashlib
import json
from pathlib import Path
import sys
import types

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import Response, StreamingResponse

EXPECTED = "ca9817079d3081eff10b4020cd44b298259963321522d449eb77c0d4073d6201"
original = Path("/opt/netaigis-coding-agent/app.py").read_bytes()
assert hashlib.sha256(original).hexdigest() == EXPECTED
candidate = base64.b64decode(json.load(sys.stdin)["candidate"], validate=True)
adapter = {}
exec(compile(Path("/opt/netaigis-coding-agent/ollama_adapter.py").read_bytes(), "existing-real-adapter", "exec"), adapter)

messages = [
    {"role": "system", "content": "Stable tools and original instructions. " * 300},
    {"role": "developer", "content": "Developer constraints"},
    {"role": "user", "content": "Original task"},
    {"role": "assistant", "content": "Earlier answer", "tool_calls": [{"id": "call-1", "type": "function", "function": {"name": "read_file", "arguments": "{}"}}]},
    {"role": "tool", "tool_call_id": "call-1", "content": "Confirmed file result"},
    {"role": "user", "content": [{"type": "text", "text": "Continue"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,AA=="}}]},
]
headers = {"x-ai-user": "jimmi", "x-ai-project": "existing-project", "x-ai-conversation": "existing-session"}
focus = {"role": "system", "content": "Authoritative original task and user corrections"}
guard = types.ModuleType("focus_guard_hook")
guard.FocusRejected = type("FocusRejected", (RuntimeError,), {})
guard.guard_payload = lambda payload, _: ({**payload, "messages": [focus, *payload["messages"]]}, True)
sys.modules["focus_guard_hook"] = guard


async def exercise(source, context):
    calls, tracked = [], []
    async def outgoing(request):
        payload = json.loads(request.content)
        calls.append((request.url.path, payload))
        if request.url.path == "/internal/learning/correction":
            assert payload["messages"] == messages
            assert payload["user"] == "jimmi" and payload["project"] == "existing-project"
            return httpx.Response(200, json={"status": "no_correction"})
        if request.url.path == "/internal/learning/context":
            assert payload["messages"] == messages
            return httpx.Response(200, json={"context": context})
        assert request.url.path == "/api/chat", "Unexpected HTTP path"
        assert payload["model"] == "interchangeable-model"
        assert payload["options"] == {"num_ctx": 65536, "num_predict": 32}
        return httpx.Response(200, json={"message": {"content": "fixture answer"}, "done": True, "prompt_eval_count": 100, "eval_count": 2})
    transport = httpx.MockTransport(outgoing)
    def select(*args):
        assert args[:3] == ("jimmi", "existing-project", "existing-session")
        tracked.append(args[3])
        return 65536
    proxy = next(node for node in ast.parse(source).body if isinstance(node, ast.AsyncFunctionDef) and node.name == "proxy")
    proxy.decorator_list = []
    module = ast.fix_missing_locations(ast.Module(body=[proxy], type_ignores=[]))
    ns = dict(json=json, os=types.SimpleNamespace(environ={}), MODEL="coding", OLLAMA="http://fixture.invalid", LOCK=asyncio.Lock(),
              Request=Request, Response=Response, StreamingResponse=StreamingResponse,
              httpx=types.SimpleNamespace(AsyncClient=lambda **kw: httpx.AsyncClient(transport=transport, **kw), HTTPError=httpx.HTTPError),
              _coding_context_sessions=types.SimpleNamespace(select=select), **{key: adapter[key] for key in ["native_request", "completion", "sse_stream"]})
    exec(compile(module, "actual-gateway-proxy", "exec"), ns)
    app = FastAPI()
    app.add_api_route("/v1/{path:path}", ns["proxy"], methods=["POST"])
    body = {"model": "interchangeable-model", "stream": False, "max_tokens": 32, "messages": copy.deepcopy(messages)}
    before = copy.deepcopy(body)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://fixture.invalid") as client:
        response = await client.post("/v1/chat/completions", json=body, headers=headers)
    assert response.status_code == 200
    result = response.json()
    assert result["choices"][0]["message"]["content"] == "fixture answer"
    assert result["usage"] == {"prompt_tokens": 100, "completion_tokens": 2, "total_tokens": 102}
    assert result["model"] == "interchangeable-model"
    assert [path for path, _ in calls] == ["/internal/learning/correction", "/internal/learning/context", "/api/chat"]
    assert body == before
    assert calls[-1][1]["messages"] == adapter["native_request"]({"model": "interchangeable-model", "messages": tracked[0]}, 65536)["messages"]
    return tracked[0], calls[-1][1]["messages"]


async def main():
    old_a, _ = await exercise(original, "Accepted constraints A")
    old_b, _ = await exercise(original, "Accepted constraints B")
    new_a, native_a = await exercise(candidate, "Accepted constraints A")
    new_b, native_b = await exercise(candidate, "Accepted constraints B")
    assert old_a[1] != old_b[1]
    assert new_a[:3] == new_b[:3] == [focus, *messages[:2]]
    assert native_a[:3] == native_b[:3]
    assert new_a[3] == {"role": "system", "content": "Accepted constraints A"}
    assert new_a[4:] == messages[2:]
    assert native_a[-1] == messages[-1]
    no_context, _ = await exercise(candidate, "")
    assert no_context == [focus, *messages]
    print(json.dumps({"ok": True, "actualGatewayProxy": True, "actualAdapter": True, "realFastAPIAndHttpx": True,
                      "interceptedHTTPOnly": True, "cases": 5, "modelRequest": False, "productiveWrites": False,
                      "stablePrefixRetained": True, "learningAndFocusRetained": True,
                      "identityProjectConversationPreserved": True, "originalMessagesAndToolPairsRetained": True,
                      "inferencePerformanceAcceptancePending": True}))


if __name__ == "__main__": asyncio.run(main())
