"""Check a staged Acer adapter patch against the captured pure function only.

No service imports, HTTP requests, model requests or privileged file writes.
The complete remote module is not copied. Deployment needs its pinned module
hash, a separately verified rollback and explicit productive approval.
"""
import argparse
import ast
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

MODULE_SHA256 = "cdf5d6768d8fffb9e3d1d0f4b08db9784a5ce5b432003f4cf16d4f3a970c8b81"
FUNCTION_SHA256 = "d0597c4f074ce9ffe9548bb1e39f3a38fec0076fef75636854085f8ba6755ede"
ARGS = None


def load_function(source):
    tree = ast.parse(source)
    function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "native_request")
    namespace = {"json": json}
    exec(compile(ast.Module(body=[function], type_ignores=[]), "captured-native-request", "exec"), namespace)
    return namespace["native_request"]


def apply_patch(directory, reverse=False):
    return subprocess.run(
        ["patch", "-p1", "--batch", "--fuzz=0", "--no-backup-if-mismatch", "--reject-file=-",
         "--reverse" if reverse else "--forward", "--input=" + str(ARGS.patch)],
        cwd=directory, capture_output=True, text=True, check=False,
    )


class TokenLimitContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        capture = json.loads(ARGS.capture.read_text())["result"]
        source = capture["function_source"]
        if capture["sha256"] != MODULE_SHA256 or hashlib.sha256(source.encode()).hexdigest() != FUNCTION_SHA256:
            raise RuntimeError("Source changed; do not apply this pinned patch")
        cls.original_bytes = ("\n" * (capture["function_start_line"] - 1) + source + "\n").encode()
        cls.original = staticmethod(load_function(source))
        with tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"]) as directory:
            target = Path(directory) / "ollama_adapter.py"
            target.write_bytes(cls.original_bytes)
            result = apply_patch(directory)
            if result.returncode:
                raise RuntimeError("The exact function patch did not apply: " + result.stdout + result.stderr)
            cls.patched_bytes = target.read_bytes()
        cls.convert = staticmethod(load_function(cls.patched_bytes.decode()))

    def payload(self, **fields):
        return {"model": "interchangeable-fixture-model", "messages": [{"role": "user", "content": "fixture only"}],
                "stream": True, **fields}

    def test_preserves_existing_contract_without_a_requested_limit(self):
        payload = self.payload(temperature=0.2, tools=[{"type": "function", "function": {"name": "fixture"}}])
        self.assertEqual(self.convert(payload, 4096), self.original(payload, 4096))
        self.assertNotIn("num_predict", self.convert(self.payload(max_tokens=None), 4096)["options"])

    def test_forwards_each_requested_limit(self):
        for field in ("max_tokens", "max_completion_tokens"):
            with self.subTest(field=field):
                self.assertEqual(self.convert(self.payload(**{field: 8}), 4096)["options"]["num_predict"], 8)

    def test_matching_limits_work_and_conflicting_limits_fail(self):
        self.assertEqual(self.convert(self.payload(max_tokens=8, max_completion_tokens=8), 4096)["options"]["num_predict"], 8)
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            self.convert(self.payload(max_tokens=8, max_completion_tokens=16), 4096)

    def test_rejects_invalid_limits_instead_of_dropping_them(self):
        for field in ("max_tokens", "max_completion_tokens"):
            for value in (0, -1, True, "8", 8.5, [], {}):
                with self.subTest(field=field, value=value), self.assertRaisesRegex(ValueError, "positive integers"):
                    self.convert(self.payload(**{field: value}), 4096)

    def test_keeps_model_stream_context_and_caller_input(self):
        for model in ("first-fixture-model", "replacement-fixture-model"):
            for stream in (False, True):
                payload = self.payload(model=model, stream=stream, max_tokens=8)
                before = copy.deepcopy(payload)
                result = self.convert(payload, 32768)
                self.assertEqual(result["model"], model)
                self.assertIs(result["stream"], stream)
                self.assertEqual(result["options"]["num_ctx"], 32768)
                self.assertEqual(payload, before)

    def test_exact_function_restore_with_reverse_patch(self):
        with tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"]) as directory:
            target = Path(directory) / "ollama_adapter.py"
            target.write_bytes(self.patched_bytes)
            self.assertEqual(apply_patch(directory, reverse=True).returncode, 0)
            self.assertEqual(target.read_bytes(), self.original_bytes)

    def test_repeated_patch_is_rejected_without_changing_the_file(self):
        with tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"]) as directory:
            target = Path(directory) / "ollama_adapter.py"
            target.write_bytes(self.patched_bytes)
            self.assertNotEqual(apply_patch(directory).returncode, 0)
            self.assertEqual(target.read_bytes(), self.patched_bytes)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture", type=Path, required=True)
    parser.add_argument("--patch", type=Path, default=Path(__file__).with_name("netaigis-coding-agent-token-limit.patch"))
    ARGS = parser.parse_args()
    ARGS.patch = ARGS.patch.resolve()
    unittest.main(argv=[__file__], verbosity=2)
