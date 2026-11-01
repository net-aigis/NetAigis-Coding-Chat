"""Explicit replacement-model profiles and dynamic allocation, without live control."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

path = Path(__file__).with_name("netaigis-model-profile.py")
spec = importlib.util.spec_from_file_location("model_profile", path)
profile = importlib.util.module_from_spec(spec)
spec.loader.exec_module(profile)


def runtime(model="generation-a", flag="--max-context", port=31001):
    return profile.encode({"model_name": model, "host": "127.0.0.1", "port": port,
                           "exe": "/existing/engine", "args": ["--pack", "/existing/weights", flag, "32768"],
                           "experts": "unchanged", "other": {"preserve": True}})


CONFIG = profile.encode({"listen_port": 11441, "sessions_dir": "/existing/sessions",
                         "coding": {"provider": "strata", "url": "http://127.0.0.1:31000", "model": "old", "extra": "keep"},
                         "learning": {"provider": "strata", "url": "http://127.0.0.1:31000", "model": "old"},
                         "embedding": {"provider": "ollama", "url": "http://127.0.0.1:11434", "model": "existing-embedding"}})
TIERS = [32768, 65536, 131072, 262144, 524288, 786432, 1000000]


class ModelProfiles(unittest.TestCase):
    def bind(self, source=None, **kwargs):
        values = dict(config_source=CONFIG, profile_id="active-fixture", runtime_source=source or runtime(),
                      runtime_path="/existing/runtime.json", context_argument="--max-context",
                      unit="existing-model.service", user="fixtureuser", roles=["coding", "learning"], tiers=TIERS, maximum=1000000)
        values.update(kwargs)
        return profile.bind_profile(**values)

    def test_next_model_and_different_context_flag_are_configuration_only(self):
        for source, flag in ((runtime(), "--max-context"), (runtime("generation-b", "-c", 31002), "-c")):
            with self.subTest(flag=flag):
                original = json.loads(source)
                identity = profile.runtime_identity(source, flag)
                changed = profile.render_context(source, flag, 1000000, identity["signature"])
                actual = json.loads(changed)
                self.assertEqual(actual["args"][3], "1000000")
                actual["args"][3] = original["args"][3]
                self.assertEqual(actual, original)
                self.assertEqual(profile.runtime_identity(changed, flag)["signature"], identity["signature"])

    def test_changed_model_engine_weights_or_other_settings_are_not_hidden_by_context_signature(self):
        source = runtime()
        signature = profile.runtime_identity(source, "--max-context")["signature"]
        for field, value in (("model_name", "other-model"), ("exe", "/changed/engine"), ("other", {"preserve": False})):
            obj = json.loads(source)
            obj[field] = value
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "changed outside"):
                profile.render_context(profile.encode(obj), "--max-context", 65536, signature)

    def test_binds_both_shared_routes_without_touching_embeddings_or_other_configuration(self):
        result = json.loads(self.bind())
        original = json.loads(CONFIG)
        self.assertEqual(result["embedding"], original["embedding"])
        self.assertEqual(result["sessions_dir"], original["sessions_dir"])
        self.assertEqual(result["listen_port"], 11441)
        self.assertEqual(result["coding"]["extra"], "keep")
        for role in ("coding", "learning"):
            self.assertEqual(result[role]["model"], "generation-a")
            self.assertEqual(result[role]["context"]["documented_max"], 1000000)
            self.assertEqual(profile.selected_profile(result, role)["unit"], "existing-model.service")

    def test_explicit_single_role_selection_preserves_the_other_route(self):
        result = json.loads(self.bind(roles=["coding"]))
        self.assertEqual(result["learning"], json.loads(CONFIG)["learning"])

    def test_a_second_selection_uses_same_profile_slot_without_a_source_patch(self):
        first = self.bind()
        second = json.loads(self.bind(runtime("generation-b", "--max-context", 31002), config_source=first))
        self.assertEqual(list(second["runtime_profiles"]), ["active-fixture"])
        self.assertEqual(second["coding"]["model"], "generation-b")
        self.assertEqual(second["learning"]["url"], "http://127.0.0.1:31002")

    def test_rejects_inconsistent_tiers_instead_of_advertising_unreachable_one_million(self):
        for tiers, maximum in ((TIERS, 524288), ([32768, 32768], 32768), ([65536, 32768], 32768), ([True], True)):
            with self.subTest(tiers=tiers), self.assertRaises(ValueError):
                self.bind(tiers=tiers, maximum=maximum)

    def test_unknown_provider_or_role_does_not_silently_reroute(self):
        config = json.loads(CONFIG)
        config["learning"]["provider"] = "unrelated-provider"
        with self.assertRaisesRegex(ValueError, "not an existing Strata"):
            self.bind(config_source=profile.encode(config))
        with self.assertRaises(ValueError):
            self.bind(roles=["embedding"])

    def test_no_root_runtime_or_unverified_listener_is_selected(self):
        with self.assertRaises(ValueError):
            self.bind(user="root")
        obj = json.loads(runtime())
        obj["host"] = "unverified.example"
        with self.assertRaises(ValueError):
            self.bind(profile.encode(obj))

    def test_duplicate_missing_or_non_integer_context_argument_is_refused(self):
        for args in (["--max-context"], ["--max-context", "1", "--max-context", "2"], ["--max-context", "0"], ["--max-context", "1.5"]):
            obj = json.loads(runtime())
            obj["args"] = args
            with self.subTest(args=args), self.assertRaises(ValueError):
                profile.runtime_identity(profile.encode(obj), "--max-context")

    def test_unit_promotion_preserves_original_settings_and_requires_exact_source(self):
        source = b"[Unit]\nDescription=existing identity\nCollectMode=inactive-or-failed\n[Service]\nRestart=no\nEnvironment=FIXTURE_SETTING=keep\nExecStart=/usr/bin/true\n"
        sha = hashlib.sha256(source).hexdigest()
        candidate = profile.promote_unit(source, sha, "active-fixture", "fixtureuser", "/usr/local/libexec/fixture-context.py", "fixture-context")
        self.assertTrue(candidate.startswith(source))
        self.assertIn(b"User=fixtureuser\n", candidate)
        self.assertIn(b"Restart=on-failure\n", candidate)
        self.assertIn(b"RuntimeDirectory=fixture-context\nRuntimeDirectoryMode=0700", candidate)
        self.assertIn(b"KillMode=control-group", candidate)
        self.assertIn(b"ExecStart=\nExecStart=/usr/bin/python3 -I ", candidate)
        self.assertIn(b"--profile active-fixture", candidate)
        with self.assertRaisesRegex(ValueError, "unit changed"):
            profile.promote_unit(source + b"\n", sha, "active-fixture", "fixtureuser", "/usr/local/libexec/fixture-context.py", "fixture-context")

    def test_foreground_launcher_preserves_the_actual_virtualenv_instead_of_assuming_system_python(self):
        source = b"[Service]\nExecStart=\nExecStart=/sbin/runuser -u fixtureuser -- /existing/venv/bin/python3 -u /existing/server.py --engine strata --config /existing/runtime.json --host 127.0.0.1 --port 11442\n"
        command = profile.foreground_argv(source, "/existing/runtime.json", "fixtureuser")
        self.assertEqual(command, ["/existing/venv/bin/python3", "-u", "/existing/server.py", "--engine", "strata",
                                   "--config", "{runtime_config}", "--host", "127.0.0.1", "--port", "11442", "--shutdown-timeout", "180"])
        self.assertNotIn("runuser", " ".join(command))

    def test_unknown_or_different_user_launchers_are_not_reconstructed_by_guessing(self):
        for command in ["/sbin/runuser -u other -- /existing/python --engine strata --config /existing/runtime.json",
                        "/usr/bin/bash -lc '$START_MODEL'", "/existing/python --engine mock --config /existing/runtime.json"]:
            with self.subTest(command=command), self.assertRaises(ValueError):
                profile.foreground_argv(("[Service]\nExecStart=" + command + "\n").encode(), "/existing/runtime.json", "fixtureuser")


if __name__ == "__main__":
    unittest.main(verbosity=2)
