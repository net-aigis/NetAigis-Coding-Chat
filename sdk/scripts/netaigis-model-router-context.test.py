"""Synthetic contracts for precise edits; never productive acceptance."""
import hashlib
import importlib.util
import json
from pathlib import Path
import threading
import unittest
from unittest import mock

path = Path(__file__).with_name("netaigis-model-router-context.py")
spec = importlib.util.spec_from_file_location("router_context", path)
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)

SOURCE = '''import json,os
# Keep unrelated bytes, including UTF-8: äöü.
def context_capacity():
    return 32
def increase_context(required):
    raise AssertionError('old model-specific launcher must not run')
def main():
    if _TIERS[0] != 32768 or tuple(sorted(set(_TIERS))) != _TIERS:
        raise RuntimeError('tiers')
class Handler:
    def do_GET(self):
        model = CONFIG['coding']['model']
        self.respond(200, {'data':[{'id':model, 'object':'model'}]})
    def do_ollama_chat(self, payload):
        opts = payload.get('options') or {}
        scope = payload.get('scope', 'coding')
        converted = payload['messages']
        reserve = 4
        with _LOCK:
            requested = int(opts.get('num_ctx', 32768))
            scope_max = _MAX if scope == 'coding' else min(_MAX, 262144)
            if requested < 32768 or requested > scope_max:
                raise OverflowError('context')
            tier = selected_tier(max(requested, context_needed(converted, reserve)))
            if tier is None or tier > scope_max:
                raise OverflowError('maximum')
            increase_context(tier)
            return fetch_json(CONFIG[scope]['url'], '/v1/chat/completions', payload, timeout=720)
    def unrelated(self):
        return 'unchanged'
'''.encode()
HASH = hashlib.sha256(SOURCE).hexdigest()


class RouterContext(unittest.TestCase):
    def setUp(self):
        self.candidate = patch.rewrite(SOURCE, HASH)
        self.ns = {"CONFIG": {
            "coding": {"model": "current-a", "url": "http://127.0.0.1:1", "context": {"tiers": [32, 64, 1000], "documented_max": 1000}},
            "learning": {"model": "current-b", "url": "http://127.0.0.1:2", "context": {"tiers": [32, 128], "documented_max": 128}},
        }, "_LOCK": threading.RLock(), "context_needed": lambda messages, reserve: 40,
            "fetch_json": mock.Mock(return_value={"inference": "fixture"})}
        exec(compile(self.candidate, "router-context-fixture", "exec"), self.ns)
        self.request = mock.Mock(side_effect=lambda scope, required=None: {
            "current_context": required or 32, "state": "ready", "model": self.ns["CONFIG"][scope]["model"]})
        self.ns["_netaigis_context_request"] = self.request

    def test_uses_selected_role_policy_instead_of_a_shared_model_or_hard_limit(self):
        handler = self.ns["Handler"]()
        for scope, tier in (("coding", 64), ("learning", 128)):
            handler.do_ollama_chat({"scope": scope, "messages": []})
            self.request.assert_called_with(scope, tier)
        self.assertEqual(self.ns["Handler"]().unrelated(), "unchanged")
        self.assertIn("äöü".encode(), self.candidate)

    def test_invalid_context_does_not_allocate_or_infer(self):
        handler = self.ns["Handler"]()
        for value in (True, 0, -1, "64", 1001):
            with self.subTest(value=value), self.assertRaises(OverflowError):
                handler.do_ollama_chat({"messages": [], "options": {"num_ctx": value}})
        self.request.assert_not_called()
        self.ns["fetch_json"].assert_not_called()

    def test_allocation_failure_prevents_an_inference_request_without_truncation(self):
        self.request.side_effect = RuntimeError("capacity not allocated")
        with self.assertRaisesRegex(RuntimeError, "capacity not allocated"):
            self.ns["Handler"]().do_ollama_chat({"messages": []})
        self.ns["fetch_json"].assert_not_called()

    def test_distinguishes_current_allocation_from_configured_request_limit(self):
        metadata = self.ns["_netaigis_context_metadata"]("coding")
        self.assertEqual(metadata["loaded_capacity"], 32)
        self.assertEqual(metadata["request_limit"], 1000)
        self.assertEqual(metadata["allocation"], "on_demand")
        self.request.side_effect = RuntimeError("unavailable")
        self.assertEqual(self.ns["_netaigis_context_metadata"]("coding"), {
            "version": 1, "state": "unknown", "allocation": "unavailable"})

    def test_capacity_must_match_the_actually_selected_model(self):
        fetch = self.ns["fetch_json"]
        fetch.side_effect = [{"status": "ok", "loaded": True, "max_context": 64}, {"data": [{"id": "wrong-model"}]}]
        with self.assertRaisesRegex(RuntimeError, "selected_model_not_confirmed"):
            self.ns["context_capacity"]("learning")
        self.assertEqual(fetch.call_args.args[0], "http://127.0.0.1:2")

    def test_rejects_source_drift_or_a_second_rewrite(self):
        with self.assertRaisesRegex(ValueError, "source changed"):
            patch.rewrite(SOURCE + b"\n", HASH)
        with self.assertRaisesRegex(ValueError, "already present"):
            patch.rewrite(self.candidate, hashlib.sha256(self.candidate).hexdigest())


if __name__ == "__main__":
    unittest.main(verbosity=2)
