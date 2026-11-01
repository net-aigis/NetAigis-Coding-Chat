"""Actual two-file changes in private fixtures; no real service or model calls."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest import mock

path = Path(__file__).with_name("netaigis-model-router-activate.py")
spec = importlib.util.spec_from_file_location("router_activation", path)
activation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(activation)

ROUTER_SOURCE = b'''def increase_context(required):
    opts = CONFIG["coding"]["context"]["strata_launch"]
    args = [opts["bin"], str(required)]
    return args
'''
PROTOCOL = 'def rewrite(source):\n    return source + b"\\n# protocol fixture candidate\\n"\n'
MAINTENANCE = 'from __main__ import FixtureController as Controller, regular, metadata, replace_verified\n'
EVENTS = []
FAIL_START = False


def regular(path, private=False):
    if path.is_symlink() or not path.is_file():
        raise ValueError("fixture file type changed")
    return path.read_bytes()


def metadata(path):
    info = path.stat()
    return {"uid": info.st_uid, "gid": info.st_gid, "mode": stat.S_IMODE(info.st_mode), "mtime_ns": info.st_mtime_ns, "xattrs": {}}


def replace_verified(plan, content, expected_hash):
    if activation.digest(plan["source"].read_bytes()) != expected_hash:
        raise ValueError("fixture concurrent change")
    EVENTS.append("write:" + plan["source"].name)
    plan["source"].write_bytes(content)


class FixtureController:
    def quiet(self, require_running=True):
        EVENTS.append("quiet" if require_running else "repair-quiet")

    def configuration(self):
        return {"unmodified-config": "fixture"}

    def stop(self):
        EVENTS.append("stop:router")

    def start(self):
        EVENTS.append("start:router")
        if FAIL_START:
            raise RuntimeError("fixture start failure")

    def state(self):
        return {"ActiveState": "active", "MainPID": "fixture-router"}


class RouterActivation(unittest.TestCase):
    def setUp(self):
        global FAIL_START
        FAIL_START = False
        EVENTS.clear()
        self.tmp = tempfile.TemporaryDirectory(dir=os.environ["CLINE_DATA_DIR"])
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.backup = self.root / "backup"
        self.backup.mkdir(mode=0o700)
        self.router, self.config, self.runtime = [self.root / name for name in ("router.py", "router.json", "runtime.json")]
        self.original_config = {"coding": {"provider": "strata", "model": "previous-model", "url": "http://127.0.0.1:1", "context": {"strata_launch": {"bin": "unused-existing-cli"}, "tiers": [32768, 65536], "documented_max": 65536}},
                                "learning": {"provider": "strata", "model": "previous-model", "url": "http://127.0.0.1:1"},
                                "embedding": {"model": "leave-existing-embedding", "url": "http://127.0.0.1:2"}}
        self.router.write_bytes(ROUTER_SOURCE)
        self.config.write_text(json.dumps(self.original_config))
        self.runtime.write_text(json.dumps({"model_name": "already-selected-model", "host": "127.0.0.1", "port": 31001}))
        records = {}
        for file in (self.router, self.config, self.runtime):
            restored = self.backup / "restore-probe" / file.relative_to("/")
            restored.parent.mkdir(parents=True, exist_ok=True)
            restored.write_bytes(file.read_bytes())
            records[str(file)] = {"sha256": activation.digest(file.read_bytes()), "attributes": metadata(file)}
        manifest = json.dumps({"files": records}).encode()
        (self.backup / "manifest.json").write_bytes(manifest)
        (self.backup / "artifacts.tar").write_bytes(b"synthetic archive receipt; actual tar restoration is tested by preflight suite")
        self.assets = {"maintenance": MAINTENANCE, "protocol": PROTOCOL}
        self.patch = mock.patch.multiple(activation, BACKUP=self.backup, ROUTER=self.router, CONFIG=self.config, RUNTIME=self.runtime,
                                        MANIFEST=activation.digest(manifest), ARCHIVE=activation.digest((self.backup / "artifacts.tar").read_bytes()),
                                        ASSETS={k: (k, activation.digest(v.encode())) for k, v in self.assets.items()},
                                        router_has_connections=lambda: False, protected_states=self.protected,
                                        json_get=lambda url: {"data": [{"id": "already-selected-model"}]} if url.endswith("/v1/models") else {"status": "ok", "loaded": True, "max_context": 32768})
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def protected(self):
        return {"protected.service": {"ActiveState": "active", "SubState": "running", "MainPID": "123", "InvocationID": "same"}}

    def apply(self, action="apply", **kwargs):
        return activation.activate(self.assets, action, kwargs.get("maintenance", True), kwargs.get("external", True))

    def test_readonly_inspection_produces_candidates_without_writes_or_service_calls(self):
        result = self.apply("inspect")
        self.assertTrue(result["ok"])
        self.assertFalse(result["source_modified"])
        self.assertEqual(self.router.read_bytes(), ROUTER_SOURCE)
        self.assertEqual(EVENTS, [])

    def test_apply_changes_only_router_files_and_controls_only_router(self):
        result = self.apply()
        self.assertTrue(result["ok"])
        self.assertEqual(EVENTS, ["quiet", "stop:router", "write:router.py", "write:router.json", "start:router"])
        cfg = json.loads(self.config.read_bytes())
        self.assertEqual(cfg["coding"]["model"], "already-selected-model")
        self.assertEqual(cfg["learning"]["url"], "http://127.0.0.1:31001")
        self.assertEqual(cfg["embedding"], self.original_config["embedding"])
        self.assertEqual(cfg["coding"]["context"]["documented_max"], 65536)
        self.assertTrue(result["functional_model_test_pending"])
        self.assertTrue(result["context_growth_acceptance_pending"])

    def test_mismatched_legacy_launcher_cannot_start_or_download_previous_model(self):
        self.apply()
        ns = {"CONFIG": json.loads(self.config.read_bytes())}
        exec(compile(self.router.read_bytes(), "fixture-router", "exec"), ns)
        with self.assertRaisesRegex(RuntimeError, "no verified context-growth"):
            ns["increase_context"](65536)

    def test_existing_matching_legacy_profile_remains_usable(self):
        self.apply()
        cfg = json.loads(self.config.read_bytes())
        cfg["coding"]["model"] = "previous-model"
        ns = {"CONFIG": cfg}
        exec(compile(self.router.read_bytes(), "fixture-router", "exec"), ns)
        self.assertEqual(ns["increase_context"](65536), ["unused-existing-cli", "65536"])

    def test_missing_quiet_or_external_proof_refuses_before_service_changes(self):
        for args in ({"maintenance": False}, {"external": False}):
            with self.subTest(args=args), self.assertRaises(ValueError):
                self.apply(**args)
        self.assertEqual(EVENTS, [])

    def test_unreviewed_change_and_damaged_backup_are_never_overwritten(self):
        self.router.write_bytes(ROUTER_SOURCE + b"# existing user change\n")
        with self.assertRaisesRegex(ValueError, "Unreviewed router"):
            self.apply()
        self.assertEqual(EVENTS, [])
        self.router.write_bytes(ROUTER_SOURCE)
        (self.backup / "artifacts.tar").write_bytes(b"corrupted fixture")
        with self.assertRaisesRegex(ValueError, "checksums changed"):
            self.apply()

    def test_failed_start_retains_new_version_and_repair_reuses_it_without_rewriting(self):
        global FAIL_START
        FAIL_START = True
        result = self.apply()
        self.assertFalse(result["ok"])
        self.assertTrue(result["repair_required"])
        new = self.router.read_bytes()
        self.assertNotEqual(new, ROUTER_SOURCE)
        EVENTS.clear()
        FAIL_START = False
        result = self.apply("repair")
        self.assertTrue(result["ok"])
        self.assertEqual(self.router.read_bytes(), new)
        self.assertEqual(EVENTS, ["repair-quiet", "stop:router", "start:router"])

    def test_active_router_connection_refuses_before_stop(self):
        with mock.patch.object(activation, "router_has_connections", return_value=True):
            with self.assertRaisesRegex(ValueError, "active connections"):
                self.apply()
        self.assertNotIn("stop:router", EVENTS)

    def test_model_file_change_refuses_without_restart_or_config_overwrite(self):
        self.runtime.write_text('{"changed":true}')
        with self.assertRaisesRegex(ValueError, "running-model configuration changed"):
            self.apply()
        self.assertEqual(EVENTS, [])

    def test_public_asset_change_is_rejected(self):
        changed = {**self.assets, "protocol": PROTOCOL + "\n"}
        with self.assertRaisesRegex(ValueError, "assets changed"):
            activation.activate(changed, "apply", True, True)

    def test_unknown_exception_messages_do_not_leave_the_host(self):
        for error in (ValueError("private-credential-fixture"), RuntimeError("private-credential-fixture")):
            result = activation.public_failure(error)
            self.assertNotIn("credential", json.dumps(result))
        self.assertEqual(activation.public_failure(ValueError("Router still has active connections"))["reason"],
                         "Router still has active connections")


if __name__ == "__main__":
    unittest.main(verbosity=2)
