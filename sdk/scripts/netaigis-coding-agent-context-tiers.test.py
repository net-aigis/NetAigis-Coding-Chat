"""Configuration/boundary regressions for the existing per-conversation tracker."""
import hashlib
import importlib.util
import os
from pathlib import Path
import unittest
from unittest import mock

path = Path(__file__).with_name("netaigis-coding-agent-context-tiers.py")
spec = importlib.util.spec_from_file_location("context_tiers_patch", path)
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)

SOURCE = '''# Synthetic fixture: no private Acer source.
TIERS = (32768, 65536, 131072, 262144)

class ContextSessions:
    def __init__(self):
        self.sessions = {}

    def select(self, key, required):
        if required > TIERS[-1]:
            raise ValueError("Context exceeds 262144 tokens")
        previous = self.sessions.get(key, TIERS[0])
        selected = next(tier for tier in TIERS if tier >= required and tier >= previous)
        self.sessions[key] = selected
        return selected
'''.encode()
HASH = hashlib.sha256(SOURCE).hexdigest()
MILLION = "32768,65536,131072,262144,524288,786432,1000000"


def functions(data, tiers=None):
    with mock.patch.dict(os.environ):
        os.environ.pop("NETAIGIS_CONTEXT_TIERS", None)
        if tiers is not None:
            os.environ["NETAIGIS_CONTEXT_TIERS"] = tiers
        namespace = {}
        exec(compile(data, "synthetic-context-tracker", "exec"), namespace)
        return namespace


class ConfigurableContextTiers(unittest.TestCase):
    def setUp(self):
        self.candidate = patch.rewrite(SOURCE, HASH)

    def test_original_reproduces_the_262144_barrier_despite_large_input_configuration(self):
        old = functions(SOURCE, MILLION)
        with self.assertRaisesRegex(ValueError, "262144"):
            old["ContextSessions"]().select("fixture", 262145)

    def test_no_configuration_preserves_existing_limits_and_algorithm(self):
        before, after = functions(SOURCE), functions(self.candidate)
        self.assertEqual(before["TIERS"], after["TIERS"])
        for required in (1, 32768, 32769, 131073, 262144):
            self.assertEqual(before["ContextSessions"]().select("fixture", required),
                             after["ContextSessions"]().select("fixture", required))

    def test_configured_stages_support_one_million_without_code_changes(self):
        ns = functions(self.candidate, MILLION)
        tracker = ns["ContextSessions"]()
        for required, tier in ((262145, 524288), (524289, 786432), (786433, 1000000), (1000000, 1000000)):
            with self.subTest(required=required):
                self.assertEqual(tracker.select(str(required), required), tier)

    def test_excess_context_reports_actual_configured_limit(self):
        ns = functions(self.candidate, MILLION)
        with self.assertRaisesRegex(ValueError, "Context exceeds 1000000 tokens"):
            ns["ContextSessions"]().select("fixture", 1000001)

    def test_later_model_capability_changes_are_configuration_only(self):
        ns = functions(self.candidate, MILLION + ",2000000")
        self.assertEqual(ns["ContextSessions"]().select("next-model-fixture", 1500000), 2000000)
        ns = functions(self.candidate, "32768,65536")
        with self.assertRaisesRegex(ValueError, "65536"):
            ns["ContextSessions"]().select("smaller-model-fixture", 65537)

    def test_sticky_session_tier_and_other_sessions_are_preserved(self):
        tracker = functions(self.candidate, MILLION)["ContextSessions"]()
        self.assertEqual(tracker.select("actor-a/project/session", 786433), 1000000)
        self.assertEqual(tracker.select("actor-a/project/session", 10), 1000000)
        self.assertEqual(tracker.select("actor-b/project/other-session", 10), 32768)

    def test_invalid_configuration_fails_closed_without_returning_old_defaults(self):
        for raw in ("", "0", "32768,32768", "65536,32768", "32768,-1", "1.5", "true", "３２７６８", "32768,", ",32768"):
            with self.subTest(raw=raw), self.assertRaisesRegex(ValueError, "NETAIGIS_CONTEXT_TIERS"):
                functions(self.candidate, raw)

    def test_whitespace_is_allowed_in_explicit_tier_configuration(self):
        ns = functions(self.candidate, " 32768 , 65536 ")
        self.assertEqual(ns["TIERS"], (32768, 65536))

    def test_other_tracking_code_is_byte_identical(self):
        old = SOURCE.split(b"class ContextSessions", 1)[1].replace(b'"Context exceeds 262144 tokens"', b'f"Context exceeds {TIERS[-1]} tokens"')
        self.assertEqual(self.candidate.split(b"class ContextSessions", 1)[1], old)

    def test_changed_source_duplicate_or_error_anchor_refuses_candidate(self):
        with self.assertRaisesRegex(ValueError, "tracker changed"):
            patch.rewrite(SOURCE + b"\n", HASH)
        with self.assertRaisesRegex(ValueError, "already present"):
            patch.rewrite(self.candidate, hashlib.sha256(self.candidate).hexdigest())
        changed = SOURCE.replace(b"Context exceeds 262144 tokens", b"different error")
        with self.assertRaisesRegex(ValueError, "error anchor changed"):
            patch.rewrite(changed, hashlib.sha256(changed).hexdigest())


if __name__ == "__main__":
    unittest.main(verbosity=2)
