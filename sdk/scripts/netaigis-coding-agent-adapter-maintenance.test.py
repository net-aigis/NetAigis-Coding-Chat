"""Actual file replacement/restoration with a simulated service controller only.

No sudo, real systemctl, model requests or productive files are used.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import unittest
from unittest import mock
from types import SimpleNamespace

path = Path(__file__).with_name("netaigis-coding-agent-adapter-maintenance.py")
spec = importlib.util.spec_from_file_location("adapter_maintenance", path)
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


class FakeController:
    def __init__(self, source, candidate):
        self.source, self.candidate = source, candidate
        self.calls = []
        self.busy = self.fail_candidate = self.fail_original = False
        self.on_stop = None

    def healthy(self):
        self.calls.append("health")
        if self.fail_original and self.source.read_bytes() != self.candidate:
            raise repair.Refused("fixture_original_unhealthy")
        if self.fail_candidate and self.source.read_bytes() == self.candidate:
            raise repair.Refused("fixture_candidate_unhealthy")
        return {"ActiveState": "active", "MainPID": "42"}

    def quiet(self, require_running=True):
        self.calls.append("quiet")
        if self.busy:
            raise repair.Refused("fixture_active_connection")

    def configuration(self):
        return {"fixture_config": "unchanged"}

    def stop(self):
        self.calls.append("stop")
        if self.on_stop:
            self.on_stop()

    def start(self):
        self.calls.append("start")

    def state(self):
        return {"ActiveState": "failed" if self.fail_candidate else "active", "MainPID": "42"}

    def diagnostics(self, _since):
        return {"exception_classes": [], "raw_journal_output": False}


class Maintenance(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"])
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.source = root / "ollama_adapter.py"
        self.original, self.candidate = b"version = 'original-fixture'\n", b"version = 'candidate-fixture'\n"
        self.source.write_bytes(self.original)
        self.source.chmod(0o640)
        os.utime(self.source, ns=(1700000000123456789, 1700000000123456789))
        self.backup = root / "existing-preflight"
        self.backup.mkdir(mode=0o700)
        (self.backup / "restore-probe").mkdir(mode=0o700)
        shutil.copy2(self.source, self.backup / "restore-probe" / self.source.name)
        # The real tar restore is covered by the existing preflight suite.
        # This transaction suite pins bytes of its own synthetic archive artifact.
        archive = self.backup / "adapter.tar"
        archive.write_bytes(b"synthetic-archive-fixture")
        archive.chmod(0o600)
        value = {"source": str(self.source), "source_sha256": repair.digest(self.original),
                 "archive_sha256": repair.digest(archive.read_bytes()), "restore_verified": True,
                 "owner_mode_verified": True, "mtime_xattrs_verified": True,
                 "source_modified": False, "service_modified": False, "model_request": False}
        manifest = self.backup / "manifest.json"
        manifest.write_text(json.dumps(value, indent=2) + "\n")
        manifest.chmod(0o600)
        self.expected = {"before": repair.digest(self.original), "after": repair.digest(self.candidate),
                         "archive": value["archive_sha256"], "manifest": repair.digest(manifest.read_bytes())}
        sums = self.backup / "SHA256SUMS"
        sums.write_text(f'{self.expected["archive"]}  adapter.tar\n{self.expected["before"]}  restore-probe/ollama_adapter.py\n{self.expected["manifest"]}  manifest.json\n')
        sums.chmod(0o600)
        self.controller = FakeController(self.source, self.candidate)

    def plan(self):
        return repair.verify(self.source, self.backup, self.candidate, self.expected)

    def apply(self):
        return repair.transact(self.plan(), self.controller, "apply", True)

    def test_new_policy_keeps_failed_new_candidate_for_targeted_repair_without_automatic_restore(self):
        self.controller.fail_candidate = True
        result = self.apply()
        self.assertFalse(result["ok"])
        self.assertTrue(result["repair_required"])
        self.assertEqual(result["failure"], "fixture_candidate_unhealthy")
        self.assertEqual(self.source.read_bytes(), self.candidate)
        self.assertEqual(self.controller.calls.count("stop"), 1)
        self.assertEqual(self.controller.calls.count("start"), 1)

    def test_new_policy_allows_an_explicit_new_version_repair_attempt_after_a_failed_health_check(self):
        self.controller.fail_candidate = True
        self.assertFalse(self.apply()["ok"])
        self.controller.fail_candidate = False
        result = repair.transact(self.plan(), self.controller, "repair", True)
        self.assertTrue(result["ok"])
        self.assertEqual(self.source.read_bytes(), self.candidate)
        self.assertEqual(self.controller.calls.count("stop"), 2)
        self.assertEqual(self.controller.calls.count("start"), 2)

    def test_new_policy_requires_an_explicit_emergency_condition_for_old_version_restore(self):
        self.assertTrue(self.apply()["ok"])
        with self.assertRaisesRegex(repair.Refused, "emergency"):
            repair.transact(self.plan(), self.controller, "rollback", True)
        self.assertEqual(self.source.read_bytes(), self.candidate)

    def test_verification_is_read_only_and_retains_exact_restore_metadata(self):
        before = repair.metadata(self.source)
        listing = sorted(str(p.relative_to(self.backup)) for p in self.backup.rglob("*"))
        plan = self.plan()
        self.assertEqual(plan["original"], self.original)
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assertEqual(repair.metadata(self.source), before)
        self.assertEqual(sorted(str(p.relative_to(self.backup)) for p in self.backup.rglob("*")), listing)
        self.assertEqual(self.controller.calls, [])

    def test_apply_and_actual_file_rollback_keep_source_permissions_and_backup_bytes(self):
        before = repair.metadata(self.source)
        backups = {str(p.relative_to(self.backup)): p.read_bytes() for p in self.backup.rglob("*") if p.is_file()}
        self.assertTrue(self.apply()["ok"])
        self.assertEqual(self.source.read_bytes(), self.candidate)
        self.assertEqual(stat.S_IMODE(self.source.stat().st_mode), before["mode"])
        self.assertEqual(self.controller.calls.count("stop"), 1)
        self.assertEqual(self.controller.calls.count("start"), 1)
        result = repair.transact(self.plan(), self.controller, "rollback", True, emergency_confirmed=True)
        self.assertTrue(result["ok"])
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assertEqual(repair.metadata(self.source), before)
        self.assertEqual(backups, {name: (self.backup / name).read_bytes() for name in backups})
        self.assertEqual(stat.S_IMODE(next(self.backup.glob("application-*.jsonl")).stat().st_mode), 0o600)

    def test_explicit_maintenance_confirmation_is_required_before_any_service_action(self):
        with self.assertRaisesRegex(repair.Refused, "confirmation_required"):
            repair.transact(self.plan(), self.controller, "apply")
        self.assertEqual(self.controller.calls, [])
        self.assertFalse((self.backup / "application.jsonl").exists())

    def test_active_work_refuses_apply_without_stopping_or_replacing(self):
        self.controller.busy = True
        with self.assertRaisesRegex(repair.Refused, "active_connection"):
            self.apply()
        self.assertNotIn("stop", self.controller.calls)
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_unhealthy_baseline_is_not_restarted_as_part_of_this_repair(self):
        self.controller.fail_original = True
        with self.assertRaisesRegex(repair.Refused, "original_unhealthy"):
            self.apply()
        self.assertEqual(self.controller.calls, ["health"])
        self.assertFalse((self.backup / "application.jsonl").exists())

    def test_failed_candidate_health_preserves_new_bytes_and_requires_targeted_repair(self):
        before = repair.metadata(self.source)
        self.controller.fail_candidate = True
        result = self.apply()
        self.assertFalse(result["ok"])
        self.assertTrue(result["repair_required"])
        self.assertFalse(result["automatic_restore"])
        self.assertEqual(self.source.read_bytes(), self.candidate)
        for key in ("uid", "gid", "mode", "xattrs"):
            self.assertEqual(repair.metadata(self.source)[key], before[key])
        self.assertEqual(self.controller.calls.count("stop"), 1)
        self.assertEqual(self.controller.calls.count("start"), 1)

    def test_post_rename_failure_retains_replaced_file_and_records_the_exact_failure(self):
        fsync = os.fsync
        failures = []
        def fail_directory_once(descriptor):
            if stat.S_ISDIR(os.fstat(descriptor).st_mode) and not failures:
                failures.append(True)
                raise OSError("fixture directory sync failure after rename")
            fsync(descriptor)
        with mock.patch.object(repair.os, "fsync", fail_directory_once):
            result = self.apply()
        self.assertFalse(result["ok"])
        self.assertTrue(result["repair_required"])
        self.assertEqual(result["failure"], "OSError")
        self.assertEqual(self.source.read_bytes(), self.candidate)

    def test_concurrent_unknown_source_is_retained_without_blind_rollback_or_start(self):
        self.controller.on_stop = lambda: self.source.write_bytes(b"# Concurrent user work\n")
        result = self.apply()
        self.assertFalse(result["ok"])
        self.assertFalse(result["automatic_restore"])
        self.assertEqual(self.source.read_bytes(), b"# Concurrent user work\n")
        self.assertNotIn("start", self.controller.calls)

    def test_repeated_apply_is_refused_without_replacing_work_or_stopping_again(self):
        self.assertTrue(self.apply()["ok"])
        calls = self.controller.calls.copy()
        with self.assertRaisesRegex(repair.Refused, "requested_action"):
            self.apply()
        self.assertEqual(self.source.read_bytes(), self.candidate)
        self.assertEqual(self.controller.calls, calls)

    def test_damaged_archive_and_restored_bytes_are_not_admitted(self):
        (self.backup / "adapter.tar").write_bytes(b"damaged archive")
        with self.assertRaisesRegex(repair.Refused, "checksums_changed"):
            self.plan()
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_duplicate_checksum_entry_is_not_an_acceptable_manifest(self):
        sums = self.backup / "SHA256SUMS"
        sums.write_text(sums.read_text() + sums.read_text().splitlines()[0] + "\n")
        with self.assertRaisesRegex(repair.Refused, "checksum_list_changed"):
            self.plan()

    def test_source_symlink_and_new_user_bytes_are_not_replaced(self):
        self.source.rename(self.source.with_suffix(".retained"))
        self.source.symlink_to(self.source.with_suffix(".retained"))
        with self.assertRaisesRegex(repair.Refused, "owner_type"):
            self.plan()
        self.assertTrue(self.source.is_symlink())

    def test_public_or_damaged_manifest_is_not_admitted(self):
        (self.backup / "manifest.json").chmod(0o644)
        with self.assertRaisesRegex(repair.Refused, "protection_changed"):
            self.plan()

    def test_pinned_builder_refuses_changed_sources_or_assets(self):
        with self.assertRaisesRegex(repair.Refused, "assets_changed"):
            repair.build_candidate(self.original, {"finish": "changed", "patch": "changed"})

    def test_file_replacement_and_rollback_preserve_actual_extended_attributes(self):
        try:
            os.setxattr(self.source, "user.netaigis-maintenance-fixture", b"retained")
            os.setxattr(self.backup / "restore-probe" / self.source.name, "user.netaigis-maintenance-fixture", b"retained")
        except OSError:
            self.skipTest("Fixture filesystem does not support user extended attributes")
        self.assertTrue(self.apply()["ok"])
        self.assertEqual(os.getxattr(self.source, "user.netaigis-maintenance-fixture"), b"retained")
        self.assertTrue(repair.transact(self.plan(), self.controller, "rollback", True, emergency_confirmed=True)["ok"])
        self.assertEqual(os.getxattr(self.source, "user.netaigis-maintenance-fixture"), b"retained")

    def test_explicit_rollback_can_recover_an_unhealthy_candidate(self):
        self.assertTrue(self.apply()["ok"])
        self.controller.fail_candidate = True
        self.assertTrue(repair.transact(self.plan(), self.controller, "rollback", True, emergency_confirmed=True)["ok"])
        self.assertEqual(self.source.read_bytes(), self.original)

    def test_backup_is_rechecked_before_stopping_not_only_when_plan_was_read(self):
        plan = self.plan()
        (self.backup / "adapter.tar").write_bytes(b"Concurrent backup damage")
        with self.assertRaisesRegex(repair.Refused, "backup_checksums_changed"):
            repair.transact(plan, self.controller, "apply", True)
        self.assertEqual(self.controller.calls, [])

    def test_actual_controller_refuses_a_known_connection_before_mutation(self):
        controller = repair.Controller()
        state = {"LoadState": "loaded", "ActiveState": "active", "SubState": "running", "MainPID": "42"}
        state.update({key: "" for key in repair.ISOLATION_PROPERTIES})
        tcp = "header\n0: 0100007F:2CAC 0100007F:ABCD 01 rest\n"
        with mock.patch.object(controller, "details", return_value=state), mock.patch.object(repair.Path, "read_text", return_value=tcp):
            with self.assertRaisesRegex(repair.Refused, "established_connections"):
                controller.quiet()

    def test_actual_controller_allows_a_stopped_known_candidate_only_for_rollback(self):
        controller = repair.Controller()
        state = {"LoadState": "loaded", "ActiveState": "failed", "SubState": "failed", "MainPID": "0"}
        state.update({key: "" for key in repair.ISOLATION_PROPERTIES})
        with mock.patch.object(controller, "details", return_value=state), mock.patch.object(repair.Path, "read_text", return_value="header\n"):
            with self.assertRaises(repair.Refused):
                controller.quiet()
            controller.quiet(require_running=False)

    def test_service_hooks_or_stop_propagation_refuse_an_unreviewed_service_operation(self):
        controller = repair.Controller()
        state = {"LoadState": "loaded", "ActiveState": "active", "SubState": "running", "MainPID": "42"}
        state.update({key: "" for key in repair.ISOLATION_PROPERTIES})
        for field in repair.ISOLATION_PROPERTIES:
            with self.subTest(field=field), mock.patch.object(controller, "details", return_value={**state, field: "fixture-nonempty"}):
                with self.assertRaisesRegex(repair.Refused, "isolated_stop_start"):
                    controller.quiet()

    def test_controller_cannot_issue_another_service_action(self):
        with mock.patch.object(repair.subprocess, "run") as command:
            with self.assertRaisesRegex(repair.Refused, "unsupported_service_action"):
                repair.Controller().command("restart-another-service")
            command.assert_not_called()

    def test_absent_hook_output_requires_typed_dbus_evidence(self):
        controller = repair.Controller()
        state = {"LoadState": "loaded", "ActiveState": "active", "SubState": "running", "MainPID": "42"}
        state.update({key: "" for key in repair.ISOLATION_PROPERTIES[:5]})
        def query(argv, **_kwargs):
            if "GetUnit" in argv:
                data = {"type": "o", "data": ["/org/freedesktop/systemd1/unit/fixture"]}
            else:
                data = {"type": "a(sasbttttuii)", "data": []}
            return SimpleNamespace(stdout=json.dumps(data))
        with mock.patch.object(controller, "show", return_value=state), mock.patch.object(repair.subprocess, "run", side_effect=query) as queries:
            details = controller.details()
        self.assertTrue(all(key in details and details[key] == "" for key in repair.HOOK_PROPERTIES))
        self.assertEqual(queries.call_count, 5)

    def test_unavailable_typed_hook_evidence_refuses_maintenance(self):
        controller = repair.Controller()
        state = {"LoadState": "loaded", "ActiveState": "active", "SubState": "running", "MainPID": "42"}
        state.update({key: "" for key in repair.ISOLATION_PROPERTIES[:5]})
        with mock.patch.object(controller, "show", return_value=state), mock.patch.object(repair.subprocess, "run", side_effect=OSError("fixture bus unavailable")):
            with self.assertRaises(OSError):
                controller.quiet()


if __name__ == "__main__":
    unittest.main(verbosity=2)
