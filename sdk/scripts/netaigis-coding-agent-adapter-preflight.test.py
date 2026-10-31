"""Real tar filesystem restore in private local fixtures; not an Acer restore claim."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest import mock

path = Path(__file__).with_name("netaigis-coding-agent-adapter-preflight.py")
spec = importlib.util.spec_from_file_location("adapter_preflight", path)
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class Preflight(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"])
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.source = self.root / "ollama_adapter.py"
        self.content = b"# Synthetic adapter fixture\nvalue = 42\n"
        self.source.write_bytes(self.content)
        self.source.chmod(0o640)
        self.hash = hashlib.sha256(self.content).hexdigest()
        self.parent = self.root / "existing-private-backup"
        self.parent.mkdir(mode=0o700)

    def test_actual_archive_restore_preserves_bytes_metadata_and_checksums(self):
        before = preflight.attributes(self.source)
        result = preflight.prepare(self.source, self.parent, self.hash)
        backup = Path(result["backup"])
        self.assertTrue(result["restore_verified"])
        self.assertFalse(result["source_modified"])
        self.assertEqual(preflight.attributes(self.source), before)
        self.assertEqual(preflight.attributes(backup / "restore-probe/ollama_adapter.py"), before)
        self.assertEqual((backup / "restore-probe/ollama_adapter.py").read_bytes(), self.content)
        for name in ["adapter.tar", "manifest.json", "SHA256SUMS"]:
            self.assertEqual(stat.S_IMODE((backup / name).stat().st_mode), 0o600)
        for line in (backup / "SHA256SUMS").read_text().splitlines():
            digest, relative = line.split("  ", 1)
            self.assertEqual(hashlib.sha256((backup / relative).read_bytes()).hexdigest(), digest)
        self.assertEqual(json.loads((backup / "manifest.json").read_text())["source_sha256"], self.hash)

    def test_wrong_hash_creates_nothing(self):
        with self.assertRaisesRegex(ValueError, "Source changed"):
            preflight.prepare(self.source, self.parent, "0" * 64)
        self.assertEqual(list(self.parent.iterdir()), [])

    def test_existing_evidence_is_never_overwritten(self):
        first = preflight.prepare(self.source, self.parent, self.hash)
        manifest = Path(first["backup"]) / "manifest.json"
        before = manifest.read_bytes()
        with self.assertRaises(FileExistsError):
            preflight.prepare(self.source, self.parent, self.hash)
        self.assertEqual(manifest.read_bytes(), before)

    def test_refuses_public_parent_and_source_symlink(self):
        self.parent.chmod(0o755)
        with self.assertRaisesRegex(ValueError, "private"):
            preflight.prepare(self.source, self.parent, self.hash)
        self.parent.chmod(0o700)
        alias = self.root / "source-alias"
        alias.symlink_to(self.source)
        with self.assertRaisesRegex(ValueError, "regular"):
            preflight.prepare(alias, self.parent, self.hash)
        self.assertEqual(list(self.parent.iterdir()), [])

    def test_failed_archive_keeps_source_and_partial_evidence(self):
        with mock.patch.object(preflight.subprocess, "run", side_effect=RuntimeError("fixture tar failure")):
            with self.assertRaises(RuntimeError):
                preflight.prepare(self.source, self.parent, self.hash)
        self.assertEqual(self.source.read_bytes(), self.content)
        self.assertTrue((self.parent / "phase4-ollama-adapter-preflight/adapter.tar").exists())
        self.assertFalse((self.parent / "phase4-ollama-adapter-preflight/manifest.json").exists())

    def test_a_damaged_restore_never_publishes_success(self):
        run = preflight.subprocess.run
        def damaged(argv, **kwargs):
            result = run(argv, **kwargs)
            if "-xpf" in argv:
                (self.parent / "phase4-ollama-adapter-preflight/restore-probe/ollama_adapter.py").write_bytes(b"damaged fixture")
            return result
        with mock.patch.object(preflight.subprocess, "run", damaged), self.assertRaisesRegex(ValueError, "restore failed"):
            preflight.prepare(self.source, self.parent, self.hash)
        self.assertEqual(self.source.read_bytes(), self.content)
        self.assertFalse((self.parent / "phase4-ollama-adapter-preflight/manifest.json").exists())

    def test_a_changed_source_never_publishes_success(self):
        run = preflight.subprocess.run
        def changed(argv, **kwargs):
            result = run(argv, **kwargs)
            if "-xpf" in argv:
                self.source.write_bytes(b"# Concurrent fixture update\n")
            return result
        with mock.patch.object(preflight.subprocess, "run", changed), self.assertRaisesRegex(ValueError, "Source changed during"):
            preflight.prepare(self.source, self.parent, self.hash)
        self.assertEqual(self.source.read_bytes(), b"# Concurrent fixture update\n")
        self.assertFalse((self.parent / "phase4-ollama-adapter-preflight/manifest.json").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
