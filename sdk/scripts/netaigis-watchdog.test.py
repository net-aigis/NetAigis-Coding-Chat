"""Independent watchdog contracts; local HTTP server, no productive services."""
import importlib.util
import contextlib
import io
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("watchdog", Path(__file__).with_name("netaigis-watchdog.py"))
watchdog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(watchdog)


def running_unit():
    return dict.fromkeys(watchdog.PROPERTIES, "") | {
        "Id": "fixture.service", "LoadState": "loaded", "ActiveState": "active", "SubState": "running",
        "Result": "success", "MainPID": str(os.getpid()), "InvocationID": "a" * 32, "NRestarts": "0",
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.requests.append(self.path)
        if self.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "/unwanted")
            self.end_headers()
            return
        self.send_response(503 if self.path == "/unavailable" else 200)
        self.end_headers()
        if self.path == "/invalid":
            self.wfile.write(b"{invalid")
        elif self.path == "/large":
            self.wfile.write(b"x" * 65537)
        elif self.path == "/unhealthy":
            self.wfile.write(json.dumps({"status": "error", "ok": True, "api_key": "fixture-never-log"}).encode())
        else:
            self.wfile.write(json.dumps({"status": "ok", "model": "fixture-model"}).encode())

    def log_message(self, *args):
        pass


class WatchdogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.server.requests = []
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def probe(self, path="/health", units=None):
        with patch.object(watchdog, "read_unit", side_effect=units or [running_unit(), running_unit()]):
            return watchdog.check_target("fixture.service", self.base + path)

    def test_confirms_actual_pid_start_identity_and_health(self):
        result = self.probe()
        self.assertEqual(result["state"], "healthy")
        self.assertEqual(result["process"], watchdog.read_process_identity(os.getpid()))
        self.assertGreater(result["process"]["start_ticks"], 0)
        self.assertNotIn("fixture-model", json.dumps(result))

    def test_does_not_report_success_across_a_service_restart(self):
        restarted = running_unit() | {"InvocationID": "b" * 32}
        result = self.probe(units=[running_unit(), restarted])
        self.assertEqual(result["state"], "unknown")
        self.assertIn("process_changed_during_probe", result["findings"])

    def test_unknown_process_identity_is_not_health_success(self):
        with patch.object(watchdog, "read_process_identity", side_effect=PermissionError()):
            result = self.probe()
        self.assertEqual(result["state"], "unknown")
        self.assertIn("observation_failed", result["findings"])

    def test_reports_service_and_health_failures_without_response_contents(self):
        for path in ["/unavailable", "/unhealthy"]:
            with self.subTest(path=path):
                result = self.probe(path)
                self.assertEqual(result["state"], "unhealthy")
                self.assertNotIn("fixture-never-log", json.dumps(result))
        stopped = running_unit() | {"ActiveState": "failed", "SubState": "failed"}
        self.assertEqual(self.probe(units=[stopped])["state"], "unhealthy")

    def test_rejects_incomplete_or_oversized_health_data(self):
        for path in ["/invalid", "/large"]:
            with self.subTest(path=path):
                self.assertEqual(self.probe(path)["state"], "unknown")

    def test_follows_no_redirects_and_never_uses_an_unverified_external_url(self):
        self.server.requests.clear()
        self.assertEqual(self.probe("/redirect")["state"], "unhealthy")
        self.assertEqual(self.server.requests, ["/redirect"])
        with self.assertRaises(ValueError):
            watchdog.read_health("http://external-fixture.invalid/health", 1)
        with self.assertRaises(ValueError):
            watchdog.read_health(self.base + "/health?token=fixture-never-log", 1)

    def test_unit_query_never_invokes_a_shell_or_exposes_stderr(self):
        with patch.object(watchdog.subprocess, "run") as run:
            run.return_value.returncode = 1
            run.return_value.stderr = "fixture-secret"
            with self.assertRaisesRegex(RuntimeError, "^unit_query_failed$"):
                watchdog.read_unit("fixture.service", 1)
            args = run.call_args.args[0]
            self.assertEqual(args[0], "/usr/bin/systemctl")
            self.assertEqual(args[-1], "fixture.service")
            self.assertNotIn("shell", run.call_args.kwargs)
        with self.assertRaises(ValueError):
            watchdog.read_unit("--invalid.service", 1)

    def test_explicit_targets_cover_router_and_interchangeable_runtime_without_model_name_rules(self):
        targets=[('coding-fixture.service',self.base+'/health'),('learning-fixture.service',self.base+'/health'),
                 ('router-fixture.service',self.base+'/health'),('arbitrary-runtime.service',self.base+'/health')]
        argv=['watchdog','--once']
        for unit,url in targets:argv.extend(['--target',unit+'='+url])
        output=io.StringIO()
        with patch.object(__import__('sys'),'argv',argv), \
             patch.object(watchdog,'check_target',return_value={'state':'healthy'}) as check, \
             contextlib.redirect_stdout(output):
            self.assertEqual(watchdog.main(),0)
        self.assertEqual([call.args[:2] for call in check.call_args_list],targets)
        self.assertEqual(len(json.loads(output.getvalue())['observations']),4)

    def test_invalid_or_duplicate_targets_fail_before_any_observation(self):
        for targets in [['invalid=http://127.0.0.1/health'],['fixture.service=http://external-fixture.invalid/health'],
                        ['fixture.service=http://token@127.0.0.1/health'],['fixture.service='+self.base+'/health']*2]:
            argv=['watchdog','--once']
            for target in targets:argv.extend(['--target',target])
            with self.subTest(targets=targets), patch.object(__import__('sys'),'argv',argv), \
                 patch.object(watchdog,'check_target') as check, contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit):watchdog.main()
                check.assert_not_called()


if __name__ == "__main__":
    unittest.main()
