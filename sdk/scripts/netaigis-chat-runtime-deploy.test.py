"""No real services, productive paths, keys or models in this safety regression."""
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("runtime_deploy", Path(__file__).with_name("netaigis-chat-runtime-deploy.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RuntimeDeploymentSafety(unittest.TestCase):
    def test_cannot_control_an_acer_service_stop_or_restart(self):
        for action, unit in (("stop", module.UNITS[0]), ("restart", module.UNITS[0]), ("start", "ai-deepseek.service"), ("enable", "ai-agent.service")):
            with self.subTest(action=action, unit=unit), patch.object(module.subprocess, "run") as run:
                with self.assertRaises(module.Refused): module.control(action, unit)
                run.assert_not_called()

    def test_apply_requires_the_new_scope_approval_before_any_inspection_or_mutation(self):
        with patch.object(module, "validate_stage") as validate, patch.object(module, "publish") as publish:
            with self.assertRaisesRegex(module.Refused, "approval_required"): module.apply(Path("/unused"), False)
            validate.assert_not_called(); publish.assert_not_called()

    def test_no_credential_model_or_backend_changes_in_user_units(self):
        for mode in ("daemon", "dashboard"):
            text = module.unit_text(mode, module.TARGETS[module.FILES[0]])
            self.assertIn("Type=exec", text)
            self.assertIn("Restart=on-failure", text)
            self.assertIn("StartLimitBurst=6", text)
            self.assertIn(" --no-env-file ", text)
            self.assertNotIn("/opt/", text)
            self.assertNotIn("deepseek", text)
            self.assertNotIn("RECALL", text)
            self.assertNotIn("Token", text)

    def test_publish_never_overwrites_existing_files_or_follows_a_parent_symlink(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw); source = root / "source"; source.write_bytes(b"reviewed")
            target = root / "target"; target.write_bytes(b"original")
            with self.assertRaises(FileExistsError): module.publish(source, target)
            self.assertEqual(target.read_bytes(), b"original")
            linked = root / "linked"; linked.symlink_to(root, target_is_directory=True)
            with self.assertRaisesRegex(module.Refused, "ancestor_changed"): module.publish(source, linked / "nested/file")
            self.assertFalse((root / "nested").exists())

    def test_changed_staged_targets_are_refused_before_any_payload_or_service_access(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw); (root / "manifest.json").write_text(json.dumps({"version": 1, "files": {"unapproved": {}}}))
            with patch.object(module, "payload_check") as payload:
                with self.assertRaisesRegex(module.Refused, "scope_changed"): module.validate_stage(root)
                payload.assert_not_called()

    def test_snapshot_includes_live_sqlite_wal_and_actually_restores_files_and_attributes(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw); namespace = root / "own"; namespace.mkdir(mode=0o700)
            file = namespace / "original.txt"; file.write_bytes(b"immutable task")
            file.chmod(0o640); os.utime(file, ns=(1234567890000000000, 1234567890000000000))
            if hasattr(os, "setxattr"): os.setxattr(file, "user.netaigis-test", b"preserved")
            writer = sqlite3.connect(namespace / "sessions.db")
            try:
                writer.execute("PRAGMA journal_mode=WAL")
                writer.execute("CREATE TABLE messages (id INTEGER, content TEXT)")
                writer.execute("INSERT INTO messages VALUES (1, 'committed in live WAL')"); writer.commit()
                self.assertTrue(Path(str(namespace / "sessions.db") + "-wal").exists())
                backup = root / "backup"
                with patch.object(module, "NAMESPACE", namespace), patch.object(module, "BACKUP", backup):
                    seal = module.snapshot_own_data()
                    self.assertEqual(len(seal), 64)
                    record = json.loads((backup / "manifest.json").read_text())
                    self.assertTrue(record["actual_restore_verified"])
                    restored = backup / "restore-probe/snapshot"
                    with sqlite3.connect(restored / "sessions.db") as reader:
                        self.assertEqual(reader.execute("SELECT content FROM messages").fetchall(), [("committed in live WAL",)])
                    self.assertEqual((restored / "original.txt").stat().st_mtime_ns, file.stat().st_mtime_ns)
                    self.assertEqual((restored / "original.txt").stat().st_mode, file.stat().st_mode)
                    self.assertEqual((restored / "original.txt").read_bytes(), b"immutable task")
                    self.assertEqual(file.read_bytes(), b"immutable task")
            finally: writer.close()


if __name__ == "__main__": unittest.main()
