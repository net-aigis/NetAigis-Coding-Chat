"""Actual GNU tar restore with metadata, changed-source and protected-export gates."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
from unittest import mock

path = Path(__file__).with_name("netaigis-model-context-preflight.py")
spec = importlib.util.spec_from_file_location("model_context_preflight", path)
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class ModelContextBackup(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"])
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.parent = self.base / "existing-backup"
        self.export = self.base / "existing-export"
        self.parent.mkdir(mode=0o700)
        self.export.mkdir(mode=0o700)
        self.sources = self.base / "sources"
        self.sources.mkdir(mode=0o700)
        self.files = {}
        for name, data in (("router.py", b"# fixture module\nvalue = 1\n"),
                           ("runtime.json", b'{"model_name":"interchangeable-fixture","args":["--context","32768"]}\n'),
                           ("existing.service", b"[Service]\nExecStart=/usr/bin/true\n")):
            target = self.sources / name
            target.write_bytes(data)
            target.chmod(0o640)
            os.utime(target, ns=(1700000000000000000, 1700000000123456789))
            self.files[str(target)] = hashlib.sha256(data).hexdigest()
        os.setxattr(self.sources / "runtime.json", "user.fixture", b"preserve-xattr")

    def prepare(self, **kwargs):
        return preflight.prepare(self.files, self.parent, self.export, os.getuid(), os.getgid(),
                                 kwargs.pop("state", lambda: {"model.service": {"MainPID": "fixture", "InvocationID": "same"}}), **kwargs)

    def test_real_archive_restore_preserves_bytes_owner_mode_mtime_xattrs_and_export(self):
        before = {name: (Path(name).read_bytes(), preflight.attributes(Path(name))) for name in self.files}
        result = self.prepare()
        self.assertTrue(result["ok"])
        self.assertTrue(result["actual_file_restore_verified"])
        self.assertFalse(result["service_recreation_or_model_restart_tested"])
        self.assertEqual(result["file_count"], 3)
        for name, (content, attrs) in before.items():
            self.assertEqual(Path(name).read_bytes(), content)
            self.assertEqual(preflight.attributes(Path(name)), attrs)
            restored = Path(result["backup"]) / "restore-probe" / Path(name).relative_to("/")
            self.assertEqual(restored.read_bytes(), content)
            self.assertEqual(preflight.attributes(restored), attrs)
        for name in ("artifacts.tar", "manifest.json", "SHA256SUMS"):
            original, exported = Path(result["backup"]) / name, Path(result["export"]) / name
            self.assertEqual(original.read_bytes(), exported.read_bytes())
            self.assertEqual(stat.S_IMODE(exported.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(Path(result["export"]).stat().st_mode), 0o700)

    def test_source_hash_change_refuses_before_creating_backup_or_export(self):
        (self.sources / "router.py").write_text("changed fixture\n")
        with self.assertRaisesRegex(preflight.Refused, "source_hash_changed"):
            self.prepare()
        self.assertEqual(list(self.parent.iterdir()), [])
        self.assertEqual(list(self.export.iterdir()), [])

    def test_symlink_source_is_not_silently_followed(self):
        link = self.sources / "link.py"
        link.symlink_to(self.sources / "router.py")
        self.files = {str(link): self.files[str(self.sources / "router.py")]}
        with self.assertRaisesRegex(preflight.Refused, "canonical"):
            self.prepare()
        self.assertEqual(list(self.parent.iterdir()), [])

    def test_public_backup_parent_is_refused_without_changing_permissions(self):
        self.parent.chmod(0o755)
        with self.assertRaisesRegex(preflight.Refused, "not_protected"):
            self.prepare()
        self.assertEqual(stat.S_IMODE(self.parent.stat().st_mode), 0o755)

    def test_service_change_prevents_success_and_export(self):
        states = iter(({"pid": "before"}, {"pid": "after"}))
        with self.assertRaisesRegex(preflight.Refused, "service_changed"):
            self.prepare(state=lambda: next(states))
        self.assertEqual(list(self.export.iterdir()), [])

    def test_archive_flush_failure_prevents_verified_manifest_and_export(self):
        with mock.patch.object(preflight.os, "fsync", side_effect=OSError("fixture sync failure")):
            with self.assertRaises(OSError):
                self.prepare()
        self.assertFalse((self.parent / preflight.NAME / "manifest.json").exists())
        self.assertEqual(list(self.export.iterdir()), [])

    def test_source_change_during_tar_is_detected_without_export(self):
        def run(args, **kwargs):
            result = subprocess.run(args, **kwargs)
            if "-cpf" in args:
                (self.sources / "router.py").write_text("# concurrent fixture mutation\n")
            return result
        with self.assertRaisesRegex(preflight.Refused, "source_changed"):
            self.prepare(run=run)
        self.assertEqual(list(self.export.iterdir()), [])

    def test_restored_content_corruption_prevents_success_and_export(self):
        def run(args, **kwargs):
            result = subprocess.run(args, **kwargs)
            if "-xpf" in args:
                restored = self.parent / preflight.NAME / "restore-probe" / (self.sources / "router.py").relative_to("/")
                restored.write_text("# corrupt restored fixture\n")
            return result
        with self.assertRaisesRegex(preflight.Refused, "actual_restore_failed"):
            self.prepare(run=run)
        self.assertEqual(list(self.export.iterdir()), [])

    def test_completed_backup_is_never_overwritten_on_repeat(self):
        result = self.prepare()
        archive = Path(result["backup"]) / "artifacts.tar"
        before = archive.read_bytes()
        with self.assertRaises(FileExistsError):
            self.prepare()
        self.assertEqual(archive.read_bytes(), before)

    def test_symlink_export_parent_cannot_redirect_private_backup(self):
        alias = self.base / "export-alias"
        alias.symlink_to(self.export, target_is_directory=True)
        self.export = alias
        with self.assertRaisesRegex(preflight.Refused, "not_protected"):
            self.prepare()

    def test_service_snapshot_invokes_only_read_only_systemctl_show(self):
        with mock.patch.object(preflight.subprocess, "run", return_value=mock.Mock(stdout="MainPID=fixture\n")) as run:
            snapshot = preflight.service_state()
        self.assertEqual(set(snapshot), {"ai-deepseek.service", "ai-model-router.service", "netaigis-coding-agent.service"})
        for call in run.call_args_list:
            self.assertEqual(call.args[0][:2], ["systemctl", "show"])
            self.assertNotIn("shell", call.kwargs)


if __name__ == "__main__":
    unittest.main(verbosity=2)
