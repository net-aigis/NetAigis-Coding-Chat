"""Deployment preparation only, using the existing public synthetic fixtures."""
import importlib.util
import json
from pathlib import Path
import unittest


def load(name):
    path = Path(__file__).with_name(name)
    spec = importlib.util.spec_from_file_location("fixture_" + name.replace("-", "_"), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


candidate = load("netaigis-model-context-candidate.py")
router = load("netaigis-model-router-context.test.py")
tracker = load("netaigis-coding-agent-context-tiers.test.py")


class DeploymentPreparation(unittest.TestCase):
    def setUp(self):
        runtime = {"model_name": "interchangeable-model", "host": "127.0.0.1", "port": 11442,
                   "exe": "/existing/engine", "args": ["--max-context", "32768", "--experts", "6"]}
        config = {"listen_port": 11441, "sessions_dir": "/existing/sessions",
                  "embedding": {"provider": "ollama", "url": "http://127.0.0.1:11434", "model": "existing-embedding"}}
        for role in ("coding", "learning"):
            config[role] = {"provider": "strata", "model": runtime["model_name"], "url": "http://127.0.0.1:11442",
                            "context": {"tiers": [32768, 65536], "documented_max": 65536}, "unrelated": "preserve"}
        unit = ("[Unit]\nDescription=existing model\nCollectMode=inactive-or-failed\n[Service]\nRestart=no\n"
                "Environment=FIXTURE_VALUE=preserve\nWorkingDirectory=/existing/workdir\nExecStart=\n"
                "ExecStart=/sbin/runuser -u friseer -- /existing/venv/python3 -u /existing/server.py --engine strata --config "
                + candidate.RUNTIME + " --host 127.0.0.1 --port 11442\n").encode()
        self.inputs = {candidate.ROUTER: router.SOURCE, candidate.TRACKER: tracker.SOURCE, candidate.TRANSIENT: unit,
                       candidate.RUNTIME: json.dumps(runtime).encode(), candidate.CONFIG: json.dumps(config).encode()}
        self.assets = candidate.read_assets()

    def build(self):
        return candidate.build(self.inputs, self.assets, {path: candidate.digest(value) for path, value in self.inputs.items()})

    def test_prepares_exactly_the_bounded_files_without_changing_inputs(self):
        before = self.inputs.copy()
        files = self.build()
        self.assertEqual(self.inputs, before)
        self.assertEqual(set(files), {candidate.ROUTER, candidate.CONFIG, candidate.TRACKER, candidate.MODEL_UNIT,
                                     candidate.DROP_IN, candidate.PROFILE, candidate.CONTROLLER})
        self.assertNotIn(candidate.RUNTIME, files)
        self.assertNotIn(candidate.TRANSIENT, files)

    def test_keeps_existing_role_endpoints_embeddings_and_unrelated_settings(self):
        files = self.build()
        before, after = json.loads(self.inputs[candidate.CONFIG]), json.loads(files[candidate.CONFIG])
        for role in ("coding", "learning"):
            for field in ("provider", "model", "url", "unrelated"):
                self.assertEqual(before[role][field], after[role][field])
            self.assertEqual(after[role]["context"]["tiers"], candidate.TIERS)
        self.assertEqual(before["embedding"], after["embedding"])
        self.assertEqual(before["sessions_dir"], after["sessions_dir"])
        self.assertEqual(before["listen_port"], after["listen_port"])

    def test_preserves_the_actual_venv_user_environment_and_working_directory(self):
        files = self.build()
        profile = json.loads(files[candidate.CONFIG])["runtime_profiles"][candidate.PROFILE_ID]
        self.assertEqual(profile["serve_argv"][0], "/existing/venv/python3")
        self.assertEqual(profile["serve_argv"].count("{runtime_config}"), 1)
        self.assertEqual(profile["user"], "friseer")
        self.assertTrue(files[candidate.MODEL_UNIT].startswith(self.inputs[candidate.TRANSIENT]))
        self.assertIn(b"RuntimeDirectoryMode=0700", files[candidate.MODEL_UNIT])

    def test_rejects_drift_before_producing_any_candidate(self):
        expected = {path: candidate.digest(value) for path, value in self.inputs.items()}
        self.inputs[candidate.ROUTER] += b"\n# unreviewed\n"
        with self.assertRaisesRegex(ValueError, "Reviewed input changed"):
            candidate.build(self.inputs, self.assets, expected)

    def test_does_not_adopt_a_different_model_selection(self):
        config = json.loads(self.inputs[candidate.CONFIG])
        config["learning"]["model"] = "different-model"
        self.inputs[candidate.CONFIG] = json.dumps(config).encode()
        with self.assertRaisesRegex(ValueError, "route differs"):
            self.build()

    def test_rejects_an_unproven_service_user(self):
        self.inputs[candidate.TRANSIENT] = self.inputs[candidate.TRANSIENT].replace(b"-u friseer --", b"-u other --")
        with self.assertRaisesRegex(ValueError, "user differs"):
            self.build()


if __name__ == "__main__":
    unittest.main(verbosity=2)
