"""Public transport bundle tests; no SSH, sudo or production access."""
import ast
import importlib.util
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest

path = Path(__file__).with_name("netaigis-coding-agent-adapter-remote.py")
spec = importlib.util.spec_from_file_location("adapter_remote", path)
remote = importlib.util.module_from_spec(spec)
spec.loader.exec_module(remote)


class Remote(unittest.TestCase):
    def fixture(self):
        return {"maintenance": 'import json,sys\nprint(json.dumps({"args":sys.argv[1:],"assets":REPAIR_ASSETS,"name":__name__}))\n',
                "finish": "Unicode and quotes: äöü ' \\\n", "patch": "Public fixture with $(not-a-command) and `literal-backticks`"}

    def run_bundle(self, action, emergency=False):
        program = remote.remote_program(self.fixture(), action, emergency)
        result = subprocess.run([sys.executable, "-c", program], capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def test_current_public_asset_hashes_are_pinned(self):
        assets = remote.load_assets(path.parent)
        self.assertEqual(set(assets), {"maintenance", "finish", "patch"})

    def test_changed_public_asset_is_refused_before_any_remote_command(self):
        with tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"]) as directory:
            root = Path(directory)
            for filename in remote.FILES.values():
                shutil.copyfile(path.parent / filename, root / filename)
            target = root / remote.FILES["maintenance"]
            target.write_bytes(target.read_bytes() + b"# changed fixture\n")
            with self.assertRaisesRegex(ValueError, "changed"):
                remote.load_assets(root)

    def test_inspection_bundle_is_read_only_by_default_and_byte_preserving(self):
        result = self.run_bundle("inspect")
        self.assertEqual(result["args"], ["inspect"])
        self.assertEqual(result["assets"], {key: self.fixture()[key] for key in ("finish", "patch")})
        self.assertEqual(result["name"], "__main__")

    def test_apply_and_forward_repair_have_no_emergency_restore_flag(self):
        for action in ("apply", "repair"):
            with self.subTest(action=action):
                self.assertEqual(self.run_bundle(action)["args"], [action, "--maintenance-confirmed"])

    def test_old_version_restore_requires_explicit_emergency_condition(self):
        with self.assertRaisesRegex(ValueError, "emergency"):
            remote.remote_program(self.fixture(), "rollback")
        self.assertEqual(self.run_bundle("rollback", True)["args"], ["rollback", "--maintenance-confirmed", "--emergency-confirmed"])

    def test_remote_shell_quotes_the_whole_public_program_without_interpolation(self):
        program = remote.remote_program(self.fixture(), "apply")
        ast.parse(program)
        command = remote.ssh_command(program)
        self.assertEqual(command[-2], "friseer@192.168.178.43")
        self.assertEqual(shlex.split(command[-1]), ["sudo", "python3", "-c", program])
        self.assertIn("StrictHostKeyChecking=yes", command)

    def test_noninteractive_transport_never_falls_back_to_password_input(self):
        program = remote.remote_program(self.fixture(), "inspect")
        command = remote.ssh_command(program, True)
        self.assertEqual(command[1], "-T")
        self.assertEqual(shlex.split(command[-1])[:2], ["sudo", "-n"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
