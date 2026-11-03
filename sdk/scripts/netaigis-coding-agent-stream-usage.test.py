"""Synthetic streaming regression; no model requests or productive writes."""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("usage_patch", Path(__file__).with_name("netaigis-coding-agent-stream-usage.py"))
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)
SOURCE = b'''import json
async def sse_stream(native_lines, model):
    def chunk(delta, finish=None):
        return {"model": model, "choices": [{"delta": delta, "finish_reason": finish}]}
    def emit(obj):
        return ("data: " + json.dumps(obj) + "\\n\\n").encode()
    async for line in native_lines:
        data = json.loads(line)
        if data.get("error"):
            raise RuntimeError("upstream failure")
        if data.get("message"):
            yield emit(chunk(data["message"]))
        if data.get("done"):
            yield emit(chunk({}, data.get("done_reason", "stop")))
            yield b"data: [DONE]\\n\\n"
            return
    raise RuntimeError("incomplete")
'''
HASH = hashlib.sha256(SOURCE).hexdigest()

def run(source, records):
    ns = {}; exec(compile(source, "synthetic-adapter", "exec"), ns)
    async def collect():
        async def lines():
            for record in records: yield json.dumps(record)
        return [frame async for frame in ns["sse_stream"](lines(), "replaceable-model")]
    return asyncio.run(collect())

class StreamUsage(unittest.TestCase):
    def test_reproduces_loss_then_preserves_finish_text_and_confirmed_usage(self):
        records = [{"message": {"content": "answer"}}, {"done": True, "done_reason": "length", "prompt_eval_count": 123, "eval_count": 7}]
        old = run(SOURCE, records)
        self.assertFalse(any(b'"usage"' in x for x in old))
        new = run(patch.rewrite(SOURCE, HASH), records)
        self.assertEqual(new[:-2], old[:-1])
        self.assertEqual(new[-1], old[-1])
        usage = json.loads(new[-2][6:])
        self.assertEqual(usage["choices"], [])
        self.assertEqual(usage["usage"], {"prompt_tokens": 123, "completion_tokens": 7, "total_tokens": 130})
        self.assertEqual(usage["model"], "replaceable-model")

    def test_zero_is_valid_missing_invalid_partial_never_fabricated(self):
        fixed = patch.rewrite(SOURCE, HASH)
        for a, b in [(None, 3), (2, None), (-1, 3), (True, 3), (2.5, 3), ("2", 3)]:
            frames = run(fixed, [{"done": True, "prompt_eval_count": a, "eval_count": b}])
            self.assertFalse(any(b'"usage"' in x for x in frames))
        self.assertIn(b'"total_tokens": 0', run(fixed, [{"done": True, "prompt_eval_count": 0, "eval_count": 0}])[-2])

    def test_failure_and_incomplete_stream_do_not_gain_completion(self):
        for records in [[{"error": "failure"}], [{"message": {"content": "partial"}}]]:
            with self.assertRaises(RuntimeError): run(patch.rewrite(SOURCE, HASH), records)

    def test_source_and_repeat_guards(self):
        with self.assertRaises(ValueError): patch.rewrite(SOURCE + b"\n", HASH)
        fixed = patch.rewrite(SOURCE, HASH)
        with self.assertRaises(ValueError): patch.rewrite(fixed, hashlib.sha256(fixed).hexdigest())

if __name__ == "__main__": unittest.main()
