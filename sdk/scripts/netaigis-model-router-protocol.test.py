"""Synthetic contracts and actual loopback HTTP for the guarded router repair.

The fixture is deliberately small, not a copy of the private Acer module.
No installed service, configuration, model or session is touched.
"""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
from pathlib import Path
import threading
import unittest
from unittest import mock
import urllib.error
import urllib.request

path = Path(__file__).with_name("netaigis-model-router-protocol.py")
spec = importlib.util.spec_from_file_location("router_protocol_patch", path)
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)

SOURCE = '''import copy
import json
# Unrelated configuration and growth code must remain byte-identical: äöü.
def increase_context(required):
    return required

class Handler:
    def do_ollama_chat(self, payload):
        opts = payload.get('options') or {}
        if not isinstance(opts, dict):
            raise ValueError('options')
        messages = payload.get('messages')
        if not isinstance(messages, list) or not messages:
            raise ValueError('messages')
        if payload.get('stream', False):
            raise ValueError('stream unsupported')
        alias = payload.get('model')
        is_coding = alias in ('coding', CONFIG['coding']['model'])
        scope = 'coding' if is_coding else 'learning'
        converted = copy.deepcopy(messages)
        request = {'model': CONFIG[scope]['model'], 'messages': converted, 'stream': False, 'reasoning_effort': 'none'}
        if 'temperature' in opts:
            request['temperature'] = opts['temperature']
        if 'tools' in payload:
            request['tools'] = payload['tools']
        with _LOCK:
            requested = int(opts.get('num_ctx', 32768))
            scope_max = _MAX if is_coding else min(_MAX, 262144)
            if requested < 32768 or requested > scope_max:
                raise OverflowError('context')
            tier = selected_tier(max(requested, context_needed(converted, 4096)))
            if tier is None or tier > scope_max:
                raise OverflowError('context capacity')
            increase_context(tier)
            result = fetch_json(CONFIG[scope]['url'], '/v1/chat/completions', request, timeout=720)
        self.respond(200, result)

    def unrelated(self):
        return 'untouched'
'''.encode()
HASH = hashlib.sha256(SOURCE).hexdigest()


def event(delta=None, finish=None, usage=None):
    value = {"choices": [] if usage is not None else [{"index": 0, "delta": delta or {}, "finish_reason": finish}]}
    if usage is not None:
        value["usage"] = usage
    return "data: " + json.dumps(value) + "\n\n"


def lines(*events):
    return "".join(events).encode().splitlines(keepends=True)


def namespace(source):
    values = {"CONFIG": {"coding": {"model": "selected-model", "url": "http://127.0.0.1:1"},
                          "learning": {"model": "separate-learning-model", "url": "http://127.0.0.1:2"}},
              "_LOCK": threading.RLock(), "_MAX": 524288,
              "selected_tier": lambda count: next((n for n in (32768, 65536, 131072, 262144, 524288) if n >= count), None),
              "context_needed": mock.Mock(return_value=32768), "fetch_json": mock.Mock(return_value={"fixture": True})}
    exec(compile(source, "synthetic-router", "exec"), values)
    return values


class Response:
    def __init__(self):
        self.wfile = io.BytesIO()
        self.headers = {}
        self.close_connection = False

    def send_response(self, code):
        self.code = code

    def send_header(self, key, value):
        self.headers[key] = value

    def end_headers(self):
        pass

    def records(self):
        return [json.loads(line) for line in self.wfile.getvalue().splitlines()]


class RouterProtocol(unittest.TestCase):
    def setUp(self):
        self.candidate = patch.rewrite(SOURCE, HASH)
        self.ns = namespace(self.candidate)

    def native(self, *events):
        return list(self.ns["_netaigis_native_frames"](lines(*events), "selected-model"))

    def invoke(self, options=None, **extra):
        obj = self.ns["Handler"]()
        obj.respond = mock.Mock()
        obj.do_ollama_chat({"model": "coding", "messages": [{"role": "user", "content": "fixture"}],
                            "options": options or {}, **extra})
        return obj

    def test_original_reproduces_rejected_stream_and_lost_limit(self):
        before = namespace(SOURCE)
        obj = before["Handler"]()
        obj.respond = mock.Mock()
        base = {"model": "coding", "messages": [{"role": "user", "content": "fixture"}], "options": {"num_predict": 8}}
        with self.assertRaisesRegex(ValueError, "stream unsupported"):
            obj.do_ollama_chat({**base, "stream": True})
        obj.do_ollama_chat(base)
        self.assertNotIn("max_tokens", before["fetch_json"].call_args.args[2])

    def test_forwards_the_limit_and_uses_it_for_dynamic_context(self):
        self.invoke({"num_predict": 23, "num_ctx": 65536})
        request = self.ns["fetch_json"].call_args.args[2]
        self.assertEqual(request["max_tokens"], 23)
        self.assertEqual(self.ns["context_needed"].call_args.args[1], 23)

    def test_preserves_model_routes_tools_temperature_and_messages(self):
        tools = [{"type": "function", "function": {"name": "fixture_tool"}}]
        self.invoke({"temperature": 0.1}, model="learning", tools=tools)
        base, endpoint, request = self.ns["fetch_json"].call_args.args
        self.assertEqual((base, endpoint), ("http://127.0.0.1:2", "/v1/chat/completions"))
        self.assertEqual(request["model"], "separate-learning-model")
        self.assertEqual(request["tools"], tools)
        self.assertEqual(request["temperature"], 0.1)
        self.assertNotIn("max_tokens", request)

    def test_same_candidate_supports_replacement_models_from_configuration(self):
        for model, base, context in (("fixture-model-generation-a", "http://127.0.0.1:31001", 65536),
                                     ("fixture-model-generation-b", "http://127.0.0.1:31002", 131072)):
            with self.subTest(model=model):
                ns = namespace(self.candidate)
                ns["CONFIG"]["coding"].update(model=model, url=base)
                ns["context_needed"].return_value = context - 1
                handler = ns["Handler"]()
                handler.respond = mock.Mock()
                with mock.patch.dict(ns, increase_context=mock.Mock()) as state:
                    handler.do_ollama_chat({"model": "coding", "messages": [{"role": "user", "content": "fixture"}],
                                           "options": {"num_ctx": context, "num_predict": 8}})
                    state["increase_context"].assert_called_once_with(context)
                self.assertEqual(ns["fetch_json"].call_args.args[0], base)
                self.assertEqual(ns["fetch_json"].call_args.args[2]["model"], model)

    def test_rejects_invalid_token_limits_before_any_backend_action(self):
        for cap in (True, False, 0, -1, "8", 1.5, 131073, None):
            with self.subTest(cap=cap), self.assertRaises(ValueError):
                self.invoke({"num_predict": cap})
        self.ns["fetch_json"].assert_not_called()

    def test_dynamic_growth_keeps_existing_tiers_and_role_limits(self):
        for needed, expected in ((32768, 32768), (32769, 65536), (131073, 262144), (262145, 524288)):
            with self.subTest(needed=needed):
                self.ns["context_needed"].return_value = needed
                with mock.patch.dict(self.ns, increase_context=mock.Mock()) as state:
                    self.invoke({"num_predict": 8})
                    state["increase_context"].assert_called_once_with(expected)
        self.ns["context_needed"].return_value = 262145
        with self.assertRaises(OverflowError):
            self.invoke(model="learning")

    def test_true_stream_uses_existing_role_and_growth_without_nonstream_fetch(self):
        with mock.patch.dict(self.ns, _netaigis_ollama_stream=mock.Mock()) as state:
            self.invoke({"num_predict": 8, "num_ctx": 65536}, stream=True)
            _, base, request = state["_netaigis_ollama_stream"].call_args.args
            self.assertEqual(base, self.ns["CONFIG"]["coding"]["url"])
            self.assertEqual(request["max_tokens"], 8)
            self.ns["fetch_json"].assert_not_called()

    def test_rejects_non_boolean_stream_flags(self):
        for value in ("true", 1, None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.invoke(stream=value)

    def test_reasoning_content_and_usage_survive_stream(self):
        records = self.native(event({"role": "assistant"}), event({"reasoning_content": "reason"}),
                              event({"content": "answer"}), event(finish="length"),
                              event(usage={"prompt_tokens": 51, "completion_tokens": 4}), "data: [DONE]\n\n")
        self.assertEqual(records[1]["message"]["thinking"], "reason")
        self.assertEqual(records[2]["message"]["content"], "answer")
        self.assertTrue(records[-1]["done"])
        self.assertEqual(records[-1]["done_reason"], "length")
        self.assertEqual((records[-1]["prompt_eval_count"], records[-1]["eval_count"]), (51, 4))
        self.assertEqual(sum(record["done"] for record in records), 1)

    def test_fragmented_parallel_tool_arguments_are_emitted_once(self):
        def tool(index, name="", args="", ident=None):
            result = {"index": index, "function": {"name": name, "arguments": args}}
            if ident:
                result["id"] = ident
            return result
        records = self.native(event({"tool_calls": [tool(1, "two", '{"b":', "call-b"), tool(0, "one", '{"a":', "call-a")]}),
                              event({"tool_calls": [tool(0, args="1}"), tool(1, args="2}")]}),
                              event(finish="tool_calls"), "data: [DONE]\n\n")
        self.assertEqual(len(records), 1)
        calls = records[0]["message"]["tool_calls"]
        self.assertEqual([call["id"] for call in calls], ["call-a", "call-b"])
        self.assertEqual([call["function"]["arguments"] for call in calls], [{"a": 1}, {"b": 2}])

    def test_no_done_record_when_source_truncates_or_omits_finish(self):
        for parts in ((event({"content": "partial"}),), (event(finish="stop"),), ("data: [DONE]\n\n",)):
            with self.subTest(parts=parts):
                generator = self.ns["_netaigis_native_frames"](lines(*parts), "fixture")
                observed = []
                with self.assertRaises(ValueError):
                    while True:
                        observed.append(next(generator))
                self.assertTrue(all(not record["done"] for record in observed))

    def test_rejects_upstream_error_without_exposing_its_text(self):
        with self.assertRaisesRegex(ValueError, "invalid streaming event") as error:
            self.native('data: {"error":"private credential fixture"}\n\n')
        self.assertNotIn("credential", str(error.exception))

    def test_rejects_invalid_tool_payload_before_confirmed_native_finish(self):
        for arguments in ("not json", '"string"', "[]"):
            with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                self.native(event({"tool_calls": [{"index": 0, "function": {"name": "tool", "arguments": arguments}}]}),
                            event(finish="tool_calls"), "data: [DONE]\n\n")

    def test_accepts_sse_comments_crlf_and_multiline_data(self):
        record = json.dumps({"choices": [{"delta": {"content": "ok"}, "finish_reason": "stop"}]}, indent=2)
        multi = ": keepalive\r\n" + "".join("data: " + line + "\r\n" for line in record.splitlines()) + "\r\n"
        values = self.native(multi, "data: [DONE]\r\n\r\n")
        self.assertEqual(values[0]["message"]["content"], "ok")
        self.assertTrue(values[-1]["done"])

    def test_no_fabricated_stop_after_unsupported_finish_or_choice(self):
        for payload in ({"choices": [{"delta": {}, "finish_reason": "error"}]},
                        {"choices": [{"index": 1, "delta": {}, "finish_reason": "stop"}]},
                        {"choices": [{"delta": {}, "finish_reason": "stop"}, {}]}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                self.native("data: " + json.dumps(payload) + "\n\n", "data: [DONE]\n\n")

    def test_stream_http_failure_occurs_before_committing_success_headers(self):
        response = Response()
        error = urllib.error.HTTPError("http://fixture", 503, "fixture", {}, None)
        with mock.patch("urllib.request.urlopen", side_effect=error), self.assertRaises(urllib.error.HTTPError):
            self.ns["_netaigis_ollama_stream"](response, "http://fixture", {"model": "fixture"})
        self.assertFalse(hasattr(response, "code"))

    def test_truncated_http_stream_preserves_partial_output_and_reports_error(self):
        response = Response()
        upstream = io.BytesIO("".join([event({"content": "partial"}), event(finish="stop")]).encode())
        with mock.patch("urllib.request.urlopen", return_value=upstream):
            self.ns["_netaigis_ollama_stream"](response, "http://fixture", {"model": "fixture"})
        records = response.records()
        self.assertEqual(records[0]["message"]["content"], "partial")
        self.assertEqual(records[-1], {"error": "upstream_stream_incomplete"})
        self.assertTrue(all(not value.get("done") for value in records))

    def test_actual_http_sse_is_translated_to_native_records(self):
        received = []

        class Upstream(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_POST(self):
                received.append((self.path, json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                for value in (event({"content": "actual-http"}), event(finish="length"),
                              event(usage={"completion_tokens": 8}), "data: [DONE]\n\n"):
                    self.wfile.write(value.encode())
                    self.wfile.flush()

        with ThreadingHTTPServer(("127.0.0.1", 0), Upstream) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                response = Response()
                self.ns["_netaigis_ollama_stream"](response, "http://127.0.0.1:" + str(server.server_port),
                                                  {"model": "interchangeable-model", "max_tokens": 8, "stream": False})
            finally:
                server.shutdown()
                thread.join(timeout=3)
        self.assertEqual(received[0][0], "/v1/chat/completions")
        self.assertEqual(received[0][1]["model"], "interchangeable-model")
        self.assertTrue(received[0][1]["stream"])
        self.assertTrue(received[0][1]["stream_options"]["include_usage"])
        self.assertEqual(received[0][1]["max_tokens"], 8)
        self.assertEqual(response.code, 200)
        self.assertEqual(response.headers["Content-Type"], "application/x-ndjson")
        self.assertTrue(response.close_connection)
        self.assertEqual(response.records()[0]["message"]["content"], "actual-http")
        self.assertEqual(response.records()[-1]["done_reason"], "length")
        self.assertEqual(response.records()[-1]["eval_count"], 8)

    def test_preserves_unrelated_growth_code_and_other_handler(self):
        self.assertEqual(self.candidate.split(b"def _netaigis_native_frames", 1)[0], SOURCE.split(b"class Handler", 1)[0])
        self.assertEqual(self.ns["Handler"]().unrelated(), "untouched")
        self.assertEqual(self.candidate.split(b"    def unrelated", 1)[1], SOURCE.split(b"    def unrelated", 1)[1])

    def test_changed_source_duplicate_application_and_anchor_changes_are_refused(self):
        with self.assertRaisesRegex(ValueError, "source changed"):
            patch.rewrite(SOURCE + b"\n", HASH)
        with self.assertRaisesRegex(ValueError, "already present"):
            patch.rewrite(self.candidate, hashlib.sha256(self.candidate).hexdigest())
        changed = SOURCE.replace(b"context_needed(converted, 4096)", b"context_needed(converted, 2048)")
        with self.assertRaisesRegex(ValueError, "anchors changed"):
            patch.rewrite(changed, hashlib.sha256(changed).hexdigest())


if __name__ == "__main__":
    unittest.main(verbosity=2)
