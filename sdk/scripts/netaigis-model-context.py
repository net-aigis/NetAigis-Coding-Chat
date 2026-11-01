"""Model-neutral context allocation around the existing Strata runtime profile.

Runs inside the explicitly selected model service as its non-root user. It
controls only its own foreground Strata child, never agent or Cline services.
The router serializes inference; this socket rejects allocations while another
backend connection exists. Existing model selection and source profile stay intact.
"""
from __future__ import annotations

import argparse
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import pwd
import signal
import socket
import socketserver
import stat
import struct
import subprocess
import sys
import threading
import time
import urllib.request

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("netaigis_model_profile", Path(__file__).with_name("netaigis-model-profile.py"))
profiles = importlib.util.module_from_spec(spec)
spec.loader.exec_module(profiles)


class Refused(RuntimeError):
    """Stable public failure code; no command, configuration or secret contents."""


def load_profile(config_path, profile_id):
    config = json.loads(Path(config_path).read_bytes())
    matching = [role for role in ("coding", "learning")
                if config.get(role, {}).get("runtime_profile") == profile_id]
    if not matching:
        raise Refused("profile_not_selected")
    profile = profiles.selected_profile(config, matching[0])
    source = Path(profile["runtime_config"]).read_bytes()
    identity = profiles.runtime_identity(source, profile["context_argument"])
    if identity["signature"] != profile["signature"]:
        raise Refused("selected_runtime_changed")
    for role in matching:
        if profiles.selected_profile(config, role) != profile or config[role]["model"] != identity["model"] or config[role]["url"].rstrip("/") != identity["url"]:
            raise Refused("profile_route_mismatch")
    command = profile.get("serve_argv")
    if (not isinstance(command, list) or not command or not all(isinstance(value, str) and "\0" not in value for value in command)
            or not command[0].startswith("/") or command.count("{runtime_config}") != 1):
        raise Refused("foreground_launcher_not_configured")
    control = Path(profile.get("control_socket", ""))
    if not control.is_absolute() or len(str(control).encode()) > 100:
        raise Refused("invalid_control_socket")
    return config, profile, source, identity


def private_directory(path):
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise Refused("private_runtime_directory_required")


def backend_connections(port):
    """Observe existing direct consumers before changing the model process."""
    for name in ("/proc/net/tcp", "/proc/net/tcp6"):
        for row in Path(name).read_text().splitlines()[1:]:
            fields = row.split()
            if int(fields[1].split(":")[-1], 16) == port and fields[3] in ("01", "02", "03", "08"):
                return True
    return False


def backend_listener(port):
    for name in ("/proc/net/tcp", "/proc/net/tcp6"):
        for row in Path(name).read_text().splitlines()[1:]:
            fields = row.split()
            if int(fields[1].split(":")[-1], 16) == port and fields[3] == "0A":
                return True
    return False


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


class Supervisor:
    def __init__(self, config_path, profile_id, *, health=None, busy=None, launch=None, listener=None):
        self.config_path, self.profile_id = config_path, profile_id
        self.config, self.profile, self.source, self.identity = load_profile(config_path, profile_id)
        self.directory = Path(self.profile["control_socket"]).parent
        self.health_probe = health or self.read_health
        self.busy_probe = busy or (lambda: backend_connections(int(self.identity["url"].rsplit(":", 1)[1])))
        self.listener_probe = listener or (lambda: backend_listener(int(self.identity["url"].rsplit(":", 1)[1])))
        self.launch = launch or self.launch_child
        self.process = None
        self.current = 0
        self.state = "not_started"
        self.failed_allocations = set()
        self.lock = threading.RLock()
        self.stopping = threading.Event()

    def read_health(self):
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        headers = {"Connection": "close"}
        token = json.loads(self.source).get("api_key")
        if isinstance(token, str) and token:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(self.identity["url"] + "/health", headers=headers)
        with opener.open(request, timeout=2) as response:
            value = json.loads(response.read(65536))
        capacity = value.get(self.profile.get("health_context_field", "max_context"))
        if value.get("status") != "ok" or value.get("loaded") is not True or type(capacity) is not int or capacity < 1:
            raise Refused("backend_not_ready")
        request = urllib.request.Request(self.identity["url"] + "/v1/models", headers=headers)
        with opener.open(request, timeout=2) as response:
            models = json.loads(response.read(65536))
        if not any(item.get("id") == self.identity["model"] for item in models.get("data", [])):
            raise Refused("selected_model_not_confirmed")
        return capacity

    def launch_child(self, context):
        # Re-read immutable inputs before every allocation; never silently switch models.
        _config, _profile, source, identity = load_profile(self.config_path, self.profile_id)
        if identity["signature"] != self.identity["signature"] or _profile != self.profile:
            raise Refused("profile_changed_during_service_lifetime")
        rendered = profiles.render_context(source, self.profile["context_argument"], context, self.profile["signature"])
        target = self.directory / (self.profile_id + "-effective.json")
        temporary = target.with_name(target.name + ".pending")
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as output:
            output.write(rendered)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
        command = [str(target) if value == "{runtime_config}" else value for value in self.profile["serve_argv"]]
        return subprocess.Popen(command, cwd=self.profile.get("cwd"), start_new_session=True)

    def stop_child(self):
        child = self.process
        if child is None:
            return
        if child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                child.wait(timeout=5)
                self.process = None
                return
            try:
                child.wait(timeout=self.profile.get("stop_timeout_seconds", 180))
            except subprocess.TimeoutExpired:
                # The Popen child is still ours and has not been reaped/reused.
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait(timeout=5)
        self.process = None

    def start_child(self, context):
        if self.stopping.is_set():
            raise Refused("model_service_stopping")
        if self.listener_probe():
            raise Refused("model_listener_already_in_use")
        if self.process is not None and self.process.poll() is None:
            raise Refused("model_child_already_running")
        self.state = "starting"
        self.process = self.launch(context)
        deadline = time.monotonic() + self.profile.get("ready_timeout_seconds", 900)
        while time.monotonic() < deadline:
            if self.stopping.is_set():
                raise Refused("model_service_stopping")
            if self.process.poll() is not None:
                raise Refused("model_process_exited_before_ready")
            try:
                actual = self.health_probe()
            except Refused as error:
                if str(error) != "backend_not_ready":
                    raise
                actual = None
            except (OSError, ValueError):
                actual = None
            if actual is not None:
                if type(actual) is not int or actual < context:
                    raise Refused("backend_reported_smaller_context")
                self.current, self.state = actual, "ready"
                return
            # Bounded readiness polling inside the model service, never shell sleeps.
            try:
                self.process.wait(timeout=min(0.25, max(0.01, deadline - time.monotonic())))
            except subprocess.TimeoutExpired:
                pass
        raise Refused("model_readiness_deadline")

    def observe(self):
        if not self.lock.acquire(blocking=False):
            return {"state": self.state, "current_context": 0, "last_known_context": self.current}
        try:
            if self.process is None or self.process.poll() is not None:
                return {"state": "not_running", "current_context": 0}
            try:
                actual = self.health_probe()
                self.current = actual
            except (OSError, ValueError, Refused):
                return {"state": "unknown", "current_context": 0, "last_known_context": self.current}
            return {"state": self.state, "current_context": self.current, "model": self.identity["model"]}
        finally:
            self.lock.release()

    def ensure(self, role, required):
        with self.lock:
            _config, selected, _source, identity = load_profile(self.config_path, self.profile_id)
            if selected != self.profile or identity["signature"] != self.identity["signature"] or _config != self.config:
                raise Refused("profile_changed_during_service_lifetime")
            route = self.config.get(role, {})
            if route.get("runtime_profile") != self.profile_id or type(required) is not int or required < 1:
                raise Refused("invalid_allocation_request")
            tiers = route["context"]["tiers"]
            target = next((tier for tier in tiers if tier >= required), None)
            if target is None:
                raise Refused("configured_context_maximum_exceeded")
            observation = self.observe()
            if observation["state"] != "ready":
                raise Refused("model_not_confirmed_ready")
            if self.current >= required:
                return observation
            if target in self.failed_allocations:
                raise Refused("allocation_previously_failed")
            if self.busy_probe():
                raise Refused("model_backend_busy")
            previous = self.current
            self.state = "reallocating"
            self.stop_child()
            if self.listener_probe():
                self.state = "unknown"
                raise Refused("model_listener_not_released")
            try:
                self.start_child(target)
            except (OSError, ValueError, Refused):
                self.failed_allocations.add(target)
                self.stop_child()
                self.state = "failed"
                # Keep the same implementation/model available for smaller tasks.
                # The requested larger allocation still fails explicitly.
                try:
                    if not self.stopping.is_set() and not self.listener_probe():
                        self.start_child(previous)
                except (OSError, ValueError, Refused):
                    self.state = "failed"
                raise Refused("context_allocation_failed") from None
            return self.observe()


class ControlHandler(socketserver.StreamRequestHandler):
    def handle(self):
        try:
            self.request.settimeout(5)
            _pid, uid, _gid = struct.unpack("3i", self.request.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            if uid not in (0, os.getuid()):
                raise Refused("control_peer_not_authorized")
            line = self.rfile.readline(4097)
            if len(line) > 4096 or not line.endswith(b"\n"):
                raise Refused("invalid_control_request")
            request = json.loads(line)
            self.request.settimeout(None)
            if request.get("op") == "observe":
                result = self.server.supervisor.observe()
            elif request.get("op") == "ensure_context":
                result = self.server.supervisor.ensure(request.get("role"), request.get("required"))
            else:
                raise Refused("unknown_control_operation")
            response = {"ok": True, **result}
        except Refused as error:
            response = {"ok": False, "error": str(error)}
        except Exception:
            response = {"ok": False, "error": "context_control_failed"}
        self.wfile.write((json.dumps(response) + "\n").encode())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="/etc/ai-model-router.json")
    parser.add_argument("--profile", required=True)
    parser.add_argument("--serve", action="store_true")
    options = parser.parse_args()
    supervisor = Supervisor(options.config, options.profile)
    if not options.serve:
        print(json.dumps({"profile": options.profile, "source_context": supervisor.identity["context"],
                          "model": supervisor.identity["model"], "source_modified": False}))
        return
    if os.getuid() == 0 or pwd.getpwuid(os.getuid()).pw_name != supervisor.profile["user"]:
        raise Refused("configured_non_root_service_user_required")
    private_directory(supervisor.directory)
    lock = os.open(supervisor.directory / (options.profile + ".lock"), os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    address = supervisor.profile["control_socket"]
    if os.path.lexists(address):
        raise Refused("existing_control_socket_requires_inspection")
    server = socketserver.ThreadingUnixStreamServer(address, ControlHandler)
    socket_identity = os.lstat(address)
    server.supervisor = supervisor
    server.daemon_threads = True
    os.chmod(address, 0o600)

    def stop(_signal, _frame):
        supervisor.stopping.set()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        supervisor.start_child(supervisor.identity["context"])
        server.serve_forever(poll_interval=0.25)
    finally:
        server.server_close()
        supervisor.stop_child()
        # Only this instance's newly created ephemeral endpoint, never user data.
        try:
            current = os.lstat(address)
            if stat.S_ISSOCK(current.st_mode) and (current.st_dev, current.st_ino) == (socket_identity.st_dev, socket_identity.st_ino):
                os.unlink(address)
        except FileNotFoundError:
            pass
        os.close(lock)


if __name__ == "__main__":
    try:
        main()
    except Refused as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        raise SystemExit(1)
