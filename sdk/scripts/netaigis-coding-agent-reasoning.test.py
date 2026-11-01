"""Model-independent, synthetic native/OpenAI formatter regression contracts."""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

path = Path(__file__).with_name("netaigis-coding-agent-reasoning.py")
spec = importlib.util.spec_from_file_location("reasoning_patch", path)
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)

SOURCE = '''import json
# Unrelated native-request and context code remains untouched: äöü.
def native_request(request):
    return request

def completion(native, model):
    msg = native.get("message") or {}
    answer = {"role": "assistant", "content": msg.get("content", "")}
    if msg.get("tool_calls"):
        answer["tool_calls"] = msg["tool_calls"]
    return {"model": model, "choices": [{"message": answer, "finish_reason": native.get("done_reason", "stop")}]}

async def sse_stream(native_lines, model):
    def emit(delta):
        return 'data: ' + json.dumps({"model": model, "choices": [{"delta": delta}]}) + '\\n\\n'
    async for line in native_lines:
        obj = json.loads(line)
        msg = obj.get("message") or {}
        if msg.get("content"):
            yield emit({"content": msg["content"]})
    yield 'data: [DONE]\\n\\n'
'''.encode()
HASH = hashlib.sha256(SOURCE).hexdigest()


def functions(source):
    ns = {}
    exec(compile(source, "synthetic-adapter", "exec"), ns)
    return ns


async def frames(ns, messages):
    async def native():
        for message in messages:
            yield json.dumps({"message": message})
    return [frame async for frame in ns["sse_stream"](native(), "interchangeable-model")]


class ReasoningForwarding(unittest.TestCase):
    def setUp(self):
        self.candidate = patch.rewrite(SOURCE, HASH)
        self.ns = functions(self.candidate)

    def test_original_loses_both_reasoning_formats(self):
        original = functions(SOURCE)
        for key in ("thinking", "reasoning_content"):
            message = {key: "reason", "content": "answer"}
            self.assertNotIn("reasoning_content", original["completion"]({"message": message}, "fixture")["choices"][0]["message"])
            values = asyncio.run(frames(original, [message]))
            self.assertNotIn("reason", "".join(values))

    def test_nonstream_preserves_reasoning_separate_from_content_and_tools(self):
        for key in ("thinking", "reasoning_content"):
            with self.subTest(key=key):
                message = {key: "reason", "content": "answer", "tool_calls": [{"id": "fixture-tool"}]}
                before = json.loads(json.dumps(message))
                result = self.ns["completion"]({"message": message, "done_reason": "length"}, "chosen-model")
                answer = result["choices"][0]["message"]
                self.assertEqual(answer, {"role": "assistant", "content": "answer", "reasoning_content": "reason", "tool_calls": message["tool_calls"]})
                self.assertEqual(result["choices"][0]["finish_reason"], "length")
                self.assertEqual(result["model"], "chosen-model")
                self.assertEqual(message, before)

    def test_stream_keeps_order_and_reasoning_only_chunks(self):
        values = asyncio.run(frames(self.ns, [{"thinking": "one"}, {"reasoning_content": "two"}, {"content": "answer"}]))
        deltas = [json.loads(frame[6:])["choices"][0]["delta"] for frame in values[:-1]]
        self.assertEqual(deltas, [{"reasoning_content": "one"}, {"reasoning_content": "two"}, {"content": "answer"}])
        self.assertEqual(values[-1], "data: [DONE]\n\n")

    def test_preserves_the_existing_nested_chunk_encoder(self):
        wrapped = SOURCE.replace(b"    def emit(delta):", b"    def chunk(delta):\n        return delta\n    def emit(delta):")
        wrapped = wrapped.replace(b'yield emit({"content": msg["content"]})', b'yield emit(chunk({"content": msg["content"]}))')
        candidate = patch.rewrite(wrapped, hashlib.sha256(wrapped).hexdigest())
        self.assertIn(b"yield emit(chunk({'reasoning_content': _netaigis_reasoning}))", candidate)
        values = asyncio.run(frames(functions(candidate), [{"thinking": "reason"}]))
        self.assertEqual(json.loads(values[0][6:])["choices"][0]["delta"], {"reasoning_content": "reason"})

    def test_missing_and_null_reasoning_preserve_existing_reply(self):
        original = functions(SOURCE)
        for message in ({"content": "answer"}, {"thinking": None, "content": "answer"}, {}):
            with self.subTest(message=message):
                native = {"message": message}
                self.assertEqual(self.ns["completion"](native, "fixture"), original["completion"](native, "fixture"))
                self.assertEqual(asyncio.run(frames(self.ns, [message])), asyncio.run(frames(original, [message])))

    def test_empty_reasoning_and_explicit_openai_field_are_preserved(self):
        for message, expected in (({"thinking": ""}, ""), ({"thinking": "old", "reasoning_content": "chosen"}, "chosen")):
            answer = self.ns["completion"]({"message": message}, "fixture")["choices"][0]["message"]
            self.assertEqual(answer["reasoning_content"], expected)

    def test_invalid_reasoning_does_not_become_false_success(self):
        for value in (1, True, {}, []):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, "must be text"):
                    self.ns["completion"]({"message": {"thinking": value}}, "fixture")
                with self.assertRaisesRegex(ValueError, "must be text"):
                    asyncio.run(frames(self.ns, [{"thinking": value}]))

    def test_other_functions_and_unrelated_bytes_are_preserved(self):
        self.assertEqual(self.candidate.split(b"def completion", 1)[0], SOURCE.split(b"def completion", 1)[0])
        request = {"model": "chosen", "options": {"num_ctx": 131072}}
        self.assertIs(self.ns["native_request"](request), request)

    def test_changed_source_duplicate_and_changed_anchors_refuse_candidate(self):
        with self.assertRaisesRegex(ValueError, "source changed"):
            patch.rewrite(SOURCE + b"\n", HASH)
        with self.assertRaisesRegex(ValueError, "already present"):
            patch.rewrite(self.candidate, hashlib.sha256(self.candidate).hexdigest())
        changed = SOURCE.replace(b"answer = {", b"response = {")
        with self.assertRaisesRegex(ValueError, "message anchor changed"):
            patch.rewrite(changed, hashlib.sha256(changed).hexdigest())


if __name__ == "__main__":
    unittest.main(verbosity=2)
