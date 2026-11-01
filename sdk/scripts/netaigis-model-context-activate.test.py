"""Isolated transaction tests: actual fixture files, no Root/systemd/model access."""
import importlib.util
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

path = Path(__file__).with_name("netaigis-model-context-activate.py")
spec = importlib.util.spec_from_file_location("context_activation", path)
activation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(activation)


def input_record(path):
    info = path.stat()
    return {"sha256": activation.digest(path.read_bytes()), "attributes": {
        "uid": info.st_uid, "gid": info.st_gid, "mode": info.st_mode & 0o7777,
        "mtime_ns": info.st_mtime_ns,
        "xattrs": {key: activation.base64.b64encode(os.getxattr(path, key)).decode()
                   for key in os.listxattr(path)}}}


class RestoredInputOwnership(unittest.TestCase):
    def test_prepare_preserves_manifest_owner_instead_of_requiring_the_operator_owner(self):
        with tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"]) as root:
            folder = Path(root) / "phase4-model-context-preflight"
            restored = folder / "restore-probe/fixture/runtime.json"
            restored.parent.mkdir(parents=True)
            restored.write_bytes(b"user-owned-runtime")
            original_record = input_record(restored)
            manifest = json.dumps({"files": {"/fixture/runtime.json": original_record}}).encode()
            (folder / "manifest.json").write_bytes(manifest)
            (folder / "artifacts.tar").write_bytes(b"fixture-archive")
            assets = {name: path.with_name(name).read_bytes() for name in activation.ASSETS}
            primitives = activation.module(assets["netaigis-coding-agent-adapter-maintenance.py"], "primitives")
            regular = primitives["regular"]
            # Fixture manifests stand in for Root-owned private backup envelopes;
            # the real input reader still sees the original non-Root file owner.
            primitives["regular"] = lambda p, private=False: p.read_bytes() if private else regular(p)
            builder = {"EXPECTED": {"/fixture/runtime.json": activation.digest(restored.read_bytes())},
                       "ROUTER": "/fixture/router.py", "CONFIG": "/fixture/config.json", "ASSETS": (),
                       "build": lambda inputs, assets: {}}
            with mock.patch.object(activation, "PARENT", Path(root)), \
                 mock.patch.object(activation, "BACKUPS", {folder.name: (activation.digest(manifest), activation.digest(b"fixture-archive"))}), \
                 mock.patch.object(activation, "private_directory"), \
                 mock.patch.object(activation, "module", side_effect=lambda source, name: builder if name == "builder" else primitives), \
                 mock.patch.object(activation, "CANDIDATES", {}), \
                 mock.patch.object(activation.os, "geteuid", return_value=0):
                result = activation.prepare(assets)
            self.assertEqual(result[2]["/fixture/runtime.json"], b"user-owned-runtime")
            self.assertEqual(input_record(restored), original_record)

    def test_manifest_owner_mode_time_xattrs_and_hash_are_all_enforced(self):
        with tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"]) as root:
            source = Path(root) / "runtime.json"
            source.write_bytes(b"unchanged")
            record = input_record(source)
            self.assertEqual(activation.verified_input(source, record), b"unchanged")
            for key in ("uid", "gid", "mode", "mtime_ns", "xattrs"):
                modified = json.loads(json.dumps(record))
                modified["attributes"][key] = {"user.unexpected": "eA=="} if key == "xattrs" else modified["attributes"][key] + 1
                with self.subTest(attribute=key), self.assertRaisesRegex(activation.Refused, "attributes_changed"):
                    activation.verified_input(source, modified)
            with self.assertRaisesRegex(activation.Refused, "content_changed"):
                activation.verified_input(source, {**record, "sha256": "0" * 64})
            self.assertEqual(input_record(source), record)

    def test_a_symlink_or_an_inode_replaced_during_read_is_refused(self):
        with tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"]) as root:
            source = Path(root) / "runtime.json"
            source.write_bytes(b"unchanged")
            record = input_record(source)
            link = Path(root) / "link.json"
            link.symlink_to(source)
            with self.assertRaisesRegex(activation.Refused, "path_changed"):
                activation.verified_input(link, record)
            real_read = os.read
            replaced = False
            def raced_read(fd, count):
                nonlocal replaced
                if not replaced:
                    replacement = Path(root) / "replacement.json"
                    replacement.write_bytes(b"replacement")
                    replacement.replace(source)
                    replaced = True
                return real_read(fd, count)
            with mock.patch.object(activation.os, "read", side_effect=raced_read), \
                 self.assertRaisesRegex(activation.Refused, "changed_during_read"):
                activation.verified_input(source, record)

    def test_preparation_failure_reports_no_productive_write_or_service_action(self):
        output = io.StringIO()
        with mock.patch.object(__import__("sys"), "argv", ["context", "apply"]), \
             mock.patch.object(activation.os, "geteuid", return_value=0), \
             mock.patch.object(activation.os, "umask"), \
             mock.patch.object(activation, "prepare", side_effect=activation.Refused("verified_input_attributes_changed")), \
             contextlib.redirect_stdout(output):
            self.assertEqual(activation.main(), 1)
        report = json.loads(output.getvalue())
        self.assertEqual(report["stage"], "before_mutation")
        self.assertFalse(report["source_modified"])
        self.assertFalse(report["service_modified"])
        self.assertEqual(report["file_writes_confirmed"], 0)
        self.assertNotIn("new_implementation_retained", report)


class ContextActivation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"])
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.backup = self.root / "phase4-dynamic-context-delta"
        self.backup.mkdir(mode=0o700)
        self.runtime = self.root / "runtime.json"
        self.transient = self.root / "transient.service"
        self.unit = self.root / "persistent.service"
        self.router = self.root / "router.py"
        self.config = self.root / "config.json"
        self.tracker = self.root / "tracker.py"
        self.helper = self.root / "controller.py"
        config = json.dumps({"coding": {"model": "fixture-model", "url": "http://127.0.0.1:1"}}).encode()
        self.inputs = {str(self.runtime): b"original-runtime", str(self.transient): b"original-unit",
                       str(self.router): b"original-router", str(self.config): config, str(self.tracker): b"original-tracker"}
        for name, data in self.inputs.items(): Path(name).write_bytes(data)
        self.records = {name: input_record(Path(name)) for name in self.inputs}
        self.candidates = {str(self.router): b"new-router", str(self.config): config, str(self.tracker): b"new-tracker",
                           str(self.unit): b"new-unit", str(self.helper): b"new-controller"}
        self.builder = {"RUNTIME": str(self.runtime), "TRANSIENT": str(self.transient), "MODEL_UNIT": str(self.unit),
                        "ROUTER": str(self.router), "CONFIG": str(self.config), "TRACKER": str(self.tracker)}
        self.events = []
        self.states = {unit: {"ActiveState": "active", "SubState": "running", "MainPID": "100", "InvocationID": "fixture-stable"}
                       for unit in (*activation.UNITS, activation.PROTECTED_UNIT)}
        self.states["ai-deepseek.service"]["ControlGroup"] = "/system.slice/ai-deepseek.service"
        quiet = mock.Mock(side_effect=lambda **kwargs: self.events.append("quiet"))
        self.primitives = {"Controller": lambda: mock.Mock(quiet=quiet), "regular": lambda p: p.read_bytes(),
                           "replace_verified": self.replace}
        patches = [mock.patch.object(activation, "PARENT", self.root),
                   mock.patch.object(activation, "check_targets", side_effect=self.plans),
                   mock.patch.object(activation, "no_connections"),
                   mock.patch.object(activation, "state", side_effect=lambda unit: self.states[unit].copy()),
                   mock.patch.object(activation, "service", side_effect=self.service),
                   mock.patch.object(activation, "ready", return_value={"model": "fixture-model", "current_context": 32768}),
                   mock.patch.object(activation, "observe_or_grow", side_effect=self.grow),
                   mock.patch.object(activation, "backend_capacity", return_value=65536)]
        self.mocks = [p.start() for p in patches]
        self.addCleanup(mock.patch.stopall)

    def plans(self, *_args):
        return [{"source": Path(name), "current": activation.digest(Path(name).read_bytes()) if Path(name).exists() else None,
                 "candidate": data, "new": name not in self.inputs} for name, data in self.candidates.items()]

    def replace(self, plan, content, expected_hash):
        self.assertEqual(activation.digest(plan["source"].read_bytes()), expected_hash)
        plan["source"].write_bytes(content)

    def service(self, action, unit=None):
        self.events.append((action, unit))
        if action == "stop":
            self.assertTrue(self.unit.is_file(), "persistent definition must exist before a transient stop")
            self.assertTrue(self.helper.is_file())
            self.states[unit].update(ActiveState="inactive", SubState="dead", MainPID="0")
        elif action == "start":
            self.states[unit].update(ActiveState="active", SubState="running", MainPID="100")

    def grow(self, *_args):
        self.events.append("grow")
        self.assertEqual(self.states["ai-model-router.service"]["ActiveState"], "inactive")
        self.assertEqual(self.states["netaigis-coding-agent.service"]["ActiveState"], "inactive")
        return {"model": "fixture-model", "current_context": 65536}

    def run_action(self, action="apply", maintenance=True, external=True, emergency=False):
        return activation.transact(self.builder, self.primitives, self.inputs, self.records, self.candidates,
                                   action=action, maintenance=maintenance, external=external, emergency=emergency)

    def test_missing_confirmation_cannot_write_or_stop(self):
        for maintenance, external in ((False, True), (True, False)):
            with self.assertRaisesRegex(activation.Refused, "confirmed_quiet"):
                self.run_action(maintenance=maintenance, external=external)
        self.assertFalse(self.unit.exists())
        self.assertEqual(self.events, [])

    def test_persistent_definition_precedes_stop_and_real_growth_precedes_gateways(self):
        result = self.run_action()
        self.assertTrue(result["ok"])
        self.assertEqual(result["current_context"], 65536)
        self.assertLess(self.events.index("grow"), self.events.index(("start", "ai-model-router.service")))
        self.assertNotIn(("stop", activation.PROTECTED_UNIT), self.events)
        self.assertEqual(self.runtime.read_bytes(), self.inputs[str(self.runtime)])

    def test_failed_growth_preserves_new_files_and_attempts_new_service_availability(self):
        self.mocks[6].side_effect = activation.Refused("allocation_failed")
        with self.assertRaisesRegex(activation.Refused, "allocation_failed"):
            self.run_action()
        self.assertEqual(self.router.read_bytes(), b"new-router")
        self.assertEqual(self.unit.read_bytes(), b"new-unit")
        self.assertIn(("start", "netaigis-coding-agent.service"), self.events)
        entries = [json.loads(line) for line in next(self.backup.glob("activation-*.jsonl")).read_text().splitlines()]
        self.assertEqual(entries[-1]["stage"], "repair_required")
        self.assertTrue(entries[-1]["new_implementation_retained"])
        self.assertTrue(entries[-1]["service_action_attempted"])
        self.assertIsNone(entries[-1]["source_modified"])

    def test_live_runtime_validation_preserves_the_manifest_owner_under_root(self):
        before = input_record(self.runtime)
        with mock.patch.object(activation.os, "geteuid", return_value=0):
            self.assertTrue(self.run_action()["ok"])
        self.assertEqual(input_record(self.runtime), before)

    def test_a_forged_allocation_cannot_replace_the_independent_backend_observation(self):
        self.mocks[7].return_value = 32768
        with self.assertRaisesRegex(activation.Refused, "independent_backend_growth"):
            self.run_action()
        self.assertEqual(self.router.read_bytes(), b"new-router")

    def test_changed_runtime_refuses_before_writes_or_service_changes(self):
        self.runtime.write_bytes(b"new-model-selected-elsewhere")
        with self.assertRaisesRegex(activation.Refused, "runtime_source_changed"):
            self.run_action()
        self.assertFalse(self.unit.exists())
        self.assertEqual(self.events, [])

    def test_changed_existing_unit_is_not_overwritten_with_an_old_profile(self):
        self.transient.write_bytes(b"new-launcher-selected-elsewhere")
        with self.assertRaisesRegex(activation.Refused, "existing_model_unit_changed"):
            self.run_action()
        self.assertFalse(self.unit.exists())

    def test_busy_backend_refuses_before_mutation(self):
        self.mocks[2].side_effect = activation.Refused("affected_backend_has_active_connections")
        with self.assertRaisesRegex(activation.Refused, "active_connections"):
            self.run_action()
        self.assertEqual(self.router.read_bytes(), b"original-router")
        self.assertFalse(self.unit.exists())

    def test_emergency_is_explicit_and_never_an_automatic_first_error_action(self):
        with self.assertRaisesRegex(activation.Refused, "explicit_emergency"):
            self.run_action(action="emergency")
        self.assertFalse(self.unit.exists())

    def test_emergency_restores_reviewed_files_retains_artifacts_and_keeps_repair_open(self):
        self.run_action()
        self.mocks[7].return_value = 32768
        result = self.run_action(action="emergency", emergency=True)
        self.assertTrue(result["new_version_repair_remains_required"])
        self.assertEqual(self.router.read_bytes(), b"original-router")
        self.assertEqual(self.unit.read_bytes(), b"original-unit")
        self.assertEqual(self.helper.read_bytes(), b"new-controller")


class PublicScope(unittest.TestCase):
    def test_an_unconfirmed_model_owner_cannot_be_stopped_by_guessing_a_group(self):
        with mock.patch.object(activation, "state", return_value={"ControlGroup": "", "MainPID": "44", "ActiveState": "active"}), \
             mock.patch.object(activation.subprocess, "run") as run:
            with self.assertRaisesRegex(activation.Refused, "model_control_group_not_confirmed"):
                activation.service("stop", "ai-deepseek.service")
            run.assert_not_called()

    def test_a_new_file_is_published_whole_and_never_replaces_an_existing_target(self):
        with tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"]) as root:
            target = Path(root) / "candidate.py"
            activation.new_file(target, b"complete-candidate")
            with self.assertRaises(FileExistsError):
                activation.new_file(target, b"replacement-not-allowed")
            self.assertEqual(target.read_bytes(), b"complete-candidate")
            self.assertEqual([p.name for p in Path(root).iterdir()], ["candidate.py"])

    def test_failed_publication_leaves_no_visible_partial_target(self):
        with tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"]) as root:
            target = Path(root) / "candidate.py"
            with mock.patch.object(activation.os, "link", side_effect=OSError("fixture publication failure")):
                with self.assertRaises(OSError): activation.new_file(target, b"complete-candidate")
            self.assertEqual(list(Path(root).iterdir()), [])

    def test_collecting_a_transient_unit_is_accepted_only_with_an_empty_kernel_group(self):
        observations = [{"ControlGroup": "/system.slice/ai-deepseek.service"}, {"LoadState": "not-found"}]
        with mock.patch.object(activation, "state", side_effect=observations), \
             mock.patch.object(activation.subprocess, "run", return_value=mock.Mock(returncode=0)), \
             mock.patch.object(activation.Path, "exists", return_value=False):
            activation.service("stop", "ai-deepseek.service")

    def test_a_zero_main_pid_does_not_free_an_owned_populated_group(self):
        observations = [{"ControlGroup": "/system.slice/ai-deepseek.service"}, {"LoadState": "not-found", "MainPID": "0"}]
        with mock.patch.object(activation, "state", side_effect=observations), \
             mock.patch.object(activation.subprocess, "run", return_value=mock.Mock(returncode=0)), \
             mock.patch.object(activation.Path, "exists", return_value=True), \
             mock.patch.object(activation.Path, "read_text", return_value="populated 1\nfrozen 0\n"):
            with self.assertRaisesRegex(activation.Refused, "still_populated"):
                activation.service("stop", "ai-deepseek.service")

    def test_service_control_cannot_address_learning_or_an_unrelated_unit(self):
        with mock.patch.object(activation.subprocess, "run") as run:
            for unit in (activation.PROTECTED_UNIT, "unrelated.service"):
                with self.assertRaisesRegex(activation.Refused, "outside_scope"):
                    activation.service("stop", unit)
            run.assert_not_called()

    def test_public_asset_drift_is_rejected(self):
        assets = {name: path.with_name(name).read_bytes() for name in activation.ASSETS}
        activation.validate_assets(assets)
        assets[next(iter(assets))] += b"\n# drift\n"
        with self.assertRaisesRegex(activation.Refused, "public_assets_changed"):
            activation.validate_assets(assets)

    def test_unprivileged_invocation_cannot_enter_root_preparation(self):
        with mock.patch.object(activation.sys if hasattr(activation, "sys") else __import__("sys"), "argv", ["context", "apply"]), \
             mock.patch.object(activation.os, "geteuid", return_value=1000), mock.patch.object(activation, "prepare") as prepare:
            with self.assertRaisesRegex(SystemExit, "Root terminal"):
                activation.main()
            prepare.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
