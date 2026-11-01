"""Read-only scope, private-data filtering and terminal transport contracts."""
import base64
import importlib.util
import json
from pathlib import Path
import types
import unittest
from unittest import mock

path = Path(__file__).with_name("netaigis-model-runtime-inspect.py")
spec = importlib.util.spec_from_file_location("model_runtime_inspector", path)
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)
CONFIG = "/existing/model/runtime.json"
STATE = "User=\nGroup=\nActiveState=active\nSubState=running\nMainPID=1234\nInvocationID=fixture\nTransient=yes\n"


class ReadonlyModelInspection(unittest.TestCase):
    def runner(self, profiles=None, after=STATE, code=0):
        self.run = mock.Mock(side_effect=[types.SimpleNamespace(stdout=STATE, returncode=0),
                                         types.SimpleNamespace(stdout=json.dumps({"ok": code == 0, "profiles": profiles or []}), returncode=code),
                                         types.SimpleNamespace(stdout=after, returncode=0)])
        return self.run

    def test_existing_root_profile_is_filtered_without_private_fields(self):
        profiles = [{"id": "existing-model", "revision": "fixture", "source_config": CONFIG, "credential": "fixture-secret"},
                    {"id": "unrelated", "source_config": "/other/runtime.json", "credential": "other-secret"}]
        result = inspector.inspect("existing-model.service", CONFIG, self.runner(profiles), uid=lambda: 0)
        self.assertTrue(result["ok"])
        self.assertEqual(result["matching_profiles"], [{"id": "existing-model", "revision": "fixture", "source_config": CONFIG}])
        self.assertNotIn("secret", json.dumps(result))
        self.assertEqual([call.args[0][:2] for call in self.run.call_args_list],
                         [["systemctl", "show"], [inspector.CLI, "profile"], ["systemctl", "show"]])
        self.assertEqual(self.run.call_args_list[1].args[0][1:], ["profile", "list", "--json"])

    def test_absent_profile_is_reported_without_claiming_a_failed_query(self):
        result = inspector.inspect("existing-model.service", CONFIG, self.runner(), uid=lambda: 0)
        self.assertTrue(result["ok"])
        self.assertEqual(result["matching_profiles"], [])
        self.assertFalse(result["service_modified"])
        self.assertFalse(result["model_request"])

    def test_failed_query_is_unknown_instead_of_asserting_no_profile(self):
        result = inspector.inspect("existing-model.service", CONFIG, self.runner(code=2), uid=lambda: 0)
        self.assertFalse(result["ok"])
        self.assertFalse(result["profile_query_ok"])
        self.assertIsNone(result["root_profile_count"])

    def test_changed_service_identity_prevents_a_consistent_result(self):
        result = inspector.inspect("existing-model.service", CONFIG, self.runner(after=STATE.replace("1234", "5678")), uid=lambda: 0)
        self.assertFalse(result["ok"])
        self.assertFalse(result["service_state_stable"])

    def test_no_repeated_sudo_attempt_or_commands_without_root_visibility(self):
        run = mock.Mock()
        result = inspector.inspect("existing-model.service", CONFIG, run, uid=lambda: 1000)
        self.assertEqual(result["reason"], "root_profile_visibility_required")
        run.assert_not_called()

    def test_invalid_service_and_relative_source_are_rejected_before_commands(self):
        run = mock.Mock()
        for unit, path in (("--all", CONFIG), ("existing.service;restart", CONFIG), ("existing.service", "relative.json")):
            with self.subTest(unit=unit, path=path), self.assertRaises(ValueError):
                inspector.inspect(unit, path, run, uid=lambda: 0)
        run.assert_not_called()

    def test_remote_loader_contains_exact_public_bytes_and_only_inspection_arguments(self):
        source = b"# public fixture\n"
        program = inspector.remote_program(source, "existing.service", CONFIG)
        compile(program, "fixture-root-inspector", "exec")
        self.assertIn(repr(base64.b64encode(source).decode()), program)
        self.assertNotIn("--remote", program)
        self.assertIn(repr(["root-model-runtime-inspection", "--unit", "existing.service", "--runtime-config", CONFIG]), program)


if __name__ == "__main__":
    unittest.main(verbosity=2)
