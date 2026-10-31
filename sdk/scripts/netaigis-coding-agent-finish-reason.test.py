"""Synthetic protocol tests for the guarded patcher; no private source or model API."""
import asyncio
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest import mock

path = Path(__file__).with_name("netaigis-coding-agent-finish-reason.py")
spec = importlib.util.spec_from_file_location("finish_reason_patch", path)
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)

SOURCE = '''import json
# Fixture header remains byte-identical: äöü
def completion(native, model):
    tool_calls = native.get("message", {}).get("tool_calls", [])
    return {"model": model, "choices": [{"message": native["message"],
            "finish_reason": "tool_calls" if tool_calls else "stop"}]}

async def sse_stream(native_lines, model):
    """Keep this fixture docstring."""
    collected_calls = []
    async for line in native_lines:
        native = json.loads(line)
        collected_calls.extend(native.get("message", {}).get("tool_calls", []))
    finish = "tool_calls" if collected_calls else "stop"
    yield "data: " + json.dumps({"model": model, "choices": [{"finish_reason": finish}]}) + "\\n\\n"
'''.encode()
HASH = hashlib.sha256(SOURCE).hexdigest()


def functions(source):
    namespace = {}
    exec(compile(source, "synthetic-adapter-fixture", "exec"), namespace)
    return namespace


class FinishReasonPatch(unittest.TestCase):
    def setUp(self):
        self.candidate = patch.rewrite(SOURCE, HASH)
        self.functions = functions(self.candidate)

    def test_nonstream_stop_length_and_tool_calls(self):
        for reason, calls, expected in [("stop", [], "stop"), ("length", [], "length"), ("stop", [{}], "tool_calls"), ("length", [{}], "length")]:
            with self.subTest(reason=reason, calls=bool(calls)):
                native = {"done_reason": reason, "message": {"content": "fixture", "tool_calls": calls}}
                reply = self.functions["completion"](native, "interchangeable-fixture-model")
                self.assertEqual(reply["choices"][0]["finish_reason"], expected)
                self.assertEqual(reply["model"], "interchangeable-fixture-model")

    def test_stream_stop_length_and_tool_calls(self):
        async def run(reason, calls):
            async def lines():
                yield json.dumps({"message": {"content": "fixture", "tool_calls": calls}})
                yield json.dumps({"message": {}, "done": True, "done_reason": reason})
            return [json.loads(frame[6:])["choices"][0]["finish_reason"] async for frame in self.functions["sse_stream"](lines(), "fixture")]
        for reason, calls, expected in [("stop", [], "stop"), ("length", [], "length"), ("stop", [{}], "tool_calls"), ("length", [{}], "length")]:
            with self.subTest(reason=reason, calls=bool(calls)):
                self.assertEqual(asyncio.run(run(reason, calls)), [expected])

    def test_missing_reason_preserves_the_existing_contract(self):
        native = {"message": {"content": "fixture"}}
        self.assertEqual(self.functions["completion"](native, "fixture"), functions(SOURCE)["completion"](native, "fixture"))

    def test_rejects_changed_source(self):
        with self.assertRaisesRegex(ValueError, "source changed"):
            patch.rewrite(SOURCE + b"\n", HASH)

    def test_rejects_second_application_even_with_a_new_hash(self):
        with self.assertRaises(ValueError):
            patch.rewrite(self.candidate, hashlib.sha256(self.candidate).hexdigest())

    def test_preserves_unrelated_bytes_and_docstring(self):
        self.assertEqual(self.candidate.split(b"def completion", 1)[0], SOURCE.split(b"def completion", 1)[0])
        self.assertEqual(self.functions["sse_stream"].__doc__, "Keep this fixture docstring.")

    def test_rejects_a_missing_stream_parser(self):
        changed = SOURCE.replace(b"json.loads(line)", b"dict()")
        with self.assertRaisesRegex(ValueError, "parser changed"):
            patch.rewrite(changed, hashlib.sha256(changed).hexdigest())

    def cli(self, source, output=None):
        argv = [str(path), "--source", str(source)]
        if output is not None:
            argv += ["--output", str(output)]
        rewrite = patch.rewrite
        with mock.patch.object(sys, "argv", argv), mock.patch.object(patch, "rewrite", lambda data: rewrite(data, HASH)), contextlib.redirect_stdout(io.StringIO()) as stdout:
            patch.main()
        return json.loads(stdout.getvalue())

    def test_cli_defaults_to_read_only(self):
        with tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"]) as directory:
            source = Path(directory) / "source.py"
            source.write_bytes(SOURCE)
            result = self.cli(source)
            self.assertFalse(result["candidate_written"])
            self.assertEqual(source.read_bytes(), SOURCE)
            self.assertEqual(list(Path(directory).iterdir()), [source])

    def test_cli_writes_private_candidate_and_never_replaces_existing_files(self):
        with tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"]) as directory:
            source = Path(directory) / "source.py"
            source.write_bytes(SOURCE)
            candidate = Path(directory) / "candidate.py"
            self.assertTrue(self.cli(source, candidate)["candidate_written"])
            self.assertEqual(candidate.read_bytes(), self.candidate)
            self.assertEqual(stat.S_IMODE(candidate.stat().st_mode), 0o600)
            with self.assertRaises(FileExistsError):
                self.cli(source, candidate)
            with self.assertRaises(SystemExit):
                self.cli(source, source)
            self.assertEqual(source.read_bytes(), SOURCE)

    def test_cli_refuses_a_public_candidate_directory(self):
        with tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"]) as directory:
            source = Path(directory) / "source.py"
            source.write_bytes(SOURCE)
            public = Path(directory) / "public-fixture"
            public.mkdir(mode=0o755)
            public.chmod(0o755)
            with self.assertRaises(SystemExit):
                self.cli(source, public / "candidate.py")
            self.assertEqual(list(public.iterdir()), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
