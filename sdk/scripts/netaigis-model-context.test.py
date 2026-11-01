"""Real local child processes and HTTP fixtures, never the productive model."""
import concurrent.futures
import importlib.util
import io
import json
import os
from pathlib import Path
import pwd
import socket
import sys
import tempfile
import threading
import unittest
from unittest import mock

sys.dont_write_bytecode = True
path = Path(__file__).with_name("netaigis-model-context.py")
spec = importlib.util.spec_from_file_location("model_context", path)
context = importlib.util.module_from_spec(spec)
spec.loader.exec_module(context)

ENGINE = '''import json,sys
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
runtime=json.load(open(sys.argv[1]))
args=runtime['args'];flag=runtime.get('context_flag','--max-context');capacity=int(args[args.index(flag)+1])
if capacity==runtime.get('fixture_fail_at'):raise SystemExit(7)
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  value={'status':'ok','loaded':True,'max_context':capacity} if self.path=='/health' else {'data':[{'id':runtime['model_name']}]}
  data=json.dumps(value).encode();self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
ThreadingHTTPServer((runtime['host'],runtime['port']),Handler).serve_forever()
'''


class Allocation(unittest.TestCase):
    def setUp(self):
        # Unix-domain socket names must fit Linux's 108-byte limit.
        self.temporary = tempfile.TemporaryDirectory(prefix="netaigis-context-", dir="/tmp")
        self.root = Path(self.temporary.name)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            self.port = probe.getsockname()[1]
        self.runtime_path = self.root / "runtime.json"
        self.config_path = self.root / "router.json"
        self.engine_path = self.root / "fixture.py"
        self.engine_path.write_text(ENGINE)
        self.supervisor = None
        self.launched = []

    def tearDown(self):
        if self.supervisor:
            self.supervisor.stopping.set()
            self.supervisor.stop_child()
        self.temporary.cleanup()

    def prepare(self, model="generation-a", flag="--max-context", fail_at=None):
        runtime = {"model_name": model, "host": "127.0.0.1", "port": self.port,
                   "exe": "/existing/engine", "args": ["--pack", "/existing/weights", flag, "32"],
                   "context_flag": flag, "fixture_fail_at": fail_at}
        self.runtime_path.write_bytes(context.profiles.encode(runtime))
        config = context.profiles.encode({
            "coding": {"provider": "strata"}, "learning": {"provider": "strata"},
            "embedding": {"model": "existing-embedding", "url": "http://127.0.0.1:11434"},
        })
        selected = json.loads(context.profiles.bind_profile(
            config, "active", self.runtime_path.read_bytes(), str(self.runtime_path), flag,
            "existing-model.service", pwd.getpwuid(os.getuid()).pw_name,
            ["coding", "learning"], [32, 64, 128, 1000], 1000,
        ))
        selected["runtime_profiles"]["active"].update({
            "control_socket": str(self.root / "context.sock"),
            "serve_argv": [sys.executable, str(self.engine_path), "{runtime_config}"],
            "ready_timeout_seconds": 3, "stop_timeout_seconds": 3,
        })
        self.config_path.write_bytes(context.profiles.encode(selected))
        self.supervisor = context.Supervisor(self.config_path, "active")
        launch = self.supervisor.launch_child

        def recorded(tokens):
            self.launched.append(tokens)
            return launch(tokens)

        self.supervisor.launch = recorded
        self.supervisor.start_child(32)

    def test_grows_to_required_tier_without_modifying_source_profile_or_model_routes(self):
        self.prepare()
        runtime, config = self.runtime_path.read_bytes(), self.config_path.read_bytes()
        result = self.supervisor.ensure("coding", 40)
        self.assertEqual(result["state"], "ready")
        self.assertEqual(result["current_context"], 64)
        self.assertEqual(result["model"], "generation-a")
        self.assertEqual(self.launched, [32, 64])
        self.assertEqual(self.runtime_path.read_bytes(), runtime)
        self.assertEqual(self.config_path.read_bytes(), config)

    def test_a_different_model_and_context_flag_use_the_same_controller(self):
        self.prepare("generation-b", "-c")
        self.assertEqual(self.supervisor.ensure("learning", 129)["current_context"], 1000)
        self.assertEqual(self.supervisor.identity["model"], "generation-b")

    def test_concurrent_roles_allocate_once_and_never_shrink_a_live_context(self):
        self.prepare()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda role: self.supervisor.ensure(role, 40), ["coding", "learning"]))
        self.assertEqual([r["current_context"] for r in results], [64, 64])
        self.assertEqual(self.supervisor.ensure("coding", 10)["current_context"], 64)
        self.assertEqual(self.launched, [32, 64])

    def test_active_backend_connection_blocks_growth_without_killing_the_model(self):
        self.prepare()
        pid = self.supervisor.process.pid
        with socket.create_connection(("127.0.0.1", self.port), timeout=2):
            with self.assertRaisesRegex(context.Refused, "model_backend_busy"):
                self.supervisor.ensure("coding", 40)
        self.assertEqual(self.supervisor.process.pid, pid)
        self.assertIsNone(self.supervisor.process.poll())

    def test_failed_allocation_is_reported_and_not_retried_forever(self):
        self.prepare(fail_at=64)
        with self.assertRaisesRegex(context.Refused, "context_allocation_failed"):
            self.supervisor.ensure("coding", 40)
        self.assertEqual(self.supervisor.observe()["current_context"], 32)
        self.assertEqual(self.launched, [32, 64, 32])
        with self.assertRaisesRegex(context.Refused, "allocation_previously_failed"):
            self.supervisor.ensure("coding", 40)
        self.assertEqual(self.launched, [32, 64, 32])

    def test_changed_model_selection_is_rejected_before_stopping_current_process(self):
        self.prepare()
        pid = self.supervisor.process.pid
        changed = json.loads(self.runtime_path.read_bytes())
        changed["model_name"] = "unreviewed-replacement"
        self.runtime_path.write_bytes(context.profiles.encode(changed))
        with self.assertRaisesRegex(context.Refused, "selected_runtime_changed"):
            self.supervisor.ensure("coding", 40)
        self.assertEqual(self.supervisor.process.pid, pid)
        self.assertIsNone(self.supervisor.process.poll())

    def test_invalid_or_out_of_range_requests_do_not_start_a_process(self):
        self.prepare()
        for role, required in [("embedding", 64), ("coding", True), ("coding", 0), ("coding", 1001)]:
            with self.subTest(role=role, required=required), self.assertRaises(context.Refused):
                self.supervisor.ensure(role, required)
        self.assertEqual(self.launched, [32])

    def test_existing_router_client_allocates_through_the_authenticated_local_socket(self):
        self.prepare()
        address = self.supervisor.profile["control_socket"]
        server = context.socketserver.ThreadingUnixStreamServer(address, context.ControlHandler)
        server.supervisor = self.supervisor
        server.daemon_threads = True
        os.chmod(address, 0o600)
        worker = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
        worker.start()
        module = Path(__file__).with_name("netaigis-model-router-context.py")
        spec = importlib.util.spec_from_file_location("context_router_client", module)
        router = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(router)
        client = {"CONFIG": self.supervisor.config, "os": os, "json": json}
        exec(compile(router.HELPERS, "public-router-socket-client", "exec"), client)
        try:
            result = client["_netaigis_context_request"]("coding", 40)
            self.assertEqual(result["current_context"], 64)
            self.assertEqual(result["model"], "generation-a")
            self.assertEqual(self.launched, [32, 64])
            os.chmod(address, 0o666)
            with self.assertRaisesRegex(RuntimeError, "context_control_not_private"):
                client["_netaigis_context_request"]("coding", 100)
            self.assertEqual(self.launched, [32, 64])
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=2)

    def test_untrusted_kernel_peer_cannot_request_process_control(self):
        self.prepare()
        handler = context.ControlHandler.__new__(context.ControlHandler)
        handler.request = mock.Mock()
        handler.request.getsockopt.return_value = context.struct.pack("3i", 1, os.getuid() + 1000, 1)
        handler.rfile = io.BytesIO(b'{"op":"ensure_context","role":"coding","required":64}\n')
        handler.wfile = io.BytesIO()
        handler.server = mock.Mock(supervisor=self.supervisor)
        handler.handle()
        self.assertEqual(json.loads(handler.wfile.getvalue()), {"ok": False, "error": "control_peer_not_authorized"})
        self.assertEqual(self.launched, [32])

    def test_failed_observation_does_not_advertise_the_last_capacity_as_current(self):
        self.prepare()
        self.supervisor.health_probe = mock.Mock(side_effect=OSError("disconnected"))
        self.assertEqual(self.supervisor.observe(), {"state": "unknown", "current_context": 0, "last_known_context": 32})
        with self.assertRaisesRegex(context.Refused, "model_not_confirmed_ready"):
            self.supervisor.ensure("coding", 40)
        self.assertEqual(self.launched, [32])


if __name__ == "__main__":
    unittest.main(verbosity=2)
