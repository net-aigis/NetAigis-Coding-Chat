"""Bounded context deployment through the existing operator Root terminal.

Never changes a model selection, original runtime JSON, Learning service or VS
Code installation. Apply requires a quiet window and verified external backup.
Errors retain the new implementation for diagnosis and forward repair.
"""
import argparse
import base64
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import threading
import time
import urllib.request
import uuid

PARENT = Path("/root/netaigis-recall-backups/phase2-20261030T165000Z")
BACKUPS = {
    "phase4-model-context-preflight": ("6fb8ad9472f47875d01a35b4a3b73284951eeb5dc85048363255563824f36677", "49603207964cb3d37613f38797e7abf33cfeae2a895586be80ddf02433b5cf16"),
    "phase4-dynamic-context-delta": ("17acd9e1eecc8eafd0337a763e6e05566cb9cc616419103f30e6e4321bf18f58", "bb6f13391c00e8e05d6c0073777204616cd6bdd77f559ccb79a0398e5e8fb4a6"),
}
ASSETS = {
    "netaigis-model-context-candidate.py": "dccc61275baada11f45d938f720ff63cdf92abab78fddd2b4461cd7305840423",
    "netaigis-model-profile.py": "8bf8418428f6c9bbd7074b531b22695ee95f5d9058177794821474a18ed34798",
    "netaigis-model-context.py": "c6959442e1df00ca02cac31c399052cd27fd45b57473388ece297290778ae0f5",
    "netaigis-model-router-context.py": "f2e5e20a460a5e1b1767c61da11a43285a2f06a531aeee5f8700ad64ff8cccea",
    "netaigis-coding-agent-context-tiers.py": "1000d91195192a3494fde738bbf0967103c9eadf348a992cd26716695f290a71",
    "netaigis-coding-agent-adapter-maintenance.py": "724ef51566b333b228c317cad588da0829ebd0f8ee3de1ba6d3c35538b63f47e",
}
CANDIDATES = {
    "/opt/ai-model-router/model_router.py": "f7c9a3e84b69928088383a2646213e4fe62b31ba4b8da7a2f42a2ce3a0cbdd66",
    "/etc/ai-model-router.json": "cebf45cd7b71590ab77953d2a5bb00c97f02d9f2ecde80f563de32c092b34e99",
    "/opt/netaigis-coding-agent/context_session.py": "5f2f007ef5df7681f2494dec20da63592060822578aa1704dc27e3d1ae2a2847",
    "/opt/ai-model-router/netaigis-model-context.py": "c6959442e1df00ca02cac31c399052cd27fd45b57473388ece297290778ae0f5",
    "/opt/ai-model-router/netaigis-model-profile.py": "8bf8418428f6c9bbd7074b531b22695ee95f5d9058177794821474a18ed34798",
    "/etc/systemd/system/ai-deepseek.service": "9962b23d242a733c361240f0f053c5a32220ca95c9582d491104f3e02396dba4",
    "/etc/systemd/system/netaigis-coding-agent.service.d/context-allocation.conf": "7597baba1bda8a7bdd29cd8d2fb62cca67c0833447192e4f4e9d211504855e17",
}
# For a later forward repair add only exact, previously reviewed installed hashes.
PREVIOUS_CANDIDATES = {}
UNITS = ("netaigis-coding-agent.service", "ai-model-router.service", "ai-deepseek.service")
PROTECTED_UNIT = "ai-agent.service"


class Refused(RuntimeError):
    def __init__(self, code, path=None):
        super().__init__(code)
        self.path = path


def digest(value):
    return hashlib.sha256(value).hexdigest()


def module(source, name):
    namespace = {"__name__": "public_context_" + name}
    exec(compile(source, "public-" + name, "exec"), namespace)
    return namespace


def validate_assets(assets):
    if set(assets) != set(ASSETS) or any(digest(assets[name]) != sha for name, sha in ASSETS.items()):
        raise Refused("public_assets_changed")


def state(unit):
    if unit not in (*UNITS, PROTECTED_UNIT):
        raise Refused("service_outside_scope")
    result = subprocess.run(["systemctl", "--no-pager", "--no-ask-password", "show", unit,
                             "--property=LoadState,ActiveState,SubState,MainPID,InvocationID,User,Transient,FragmentPath,ControlGroup"],
                            capture_output=True, text=True, timeout=10, check=True)
    return dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)


def service(action, unit=None):
    before = state(unit) if action == "stop" and unit in UNITS else None
    if action == "stop" and unit == "ai-deepseek.service" and not model_group_confirmed(before):
        raise Refused("model_control_group_not_confirmed")
    if action == "daemon-reload" and unit is None:
        command = ["systemctl", "--no-pager", "--no-ask-password", action]
    elif action in ("start", "stop") and unit in UNITS:
        command = ["systemctl", "--no-pager", "--no-ask-password", action, unit]
    else:
        raise Refused("service_action_outside_scope")
    if subprocess.run(command, capture_output=True, timeout=230, check=False).returncode:
        raise Refused("service_action_failed")
    if action == "stop":
        observed = state(unit)
        if unit == "ai-deepseek.service":
            directory = Path("/sys/fs/cgroup/system.slice/ai-deepseek.service")
            # Kernel removal or recursive populated=0 confirms all owned children
            # are gone even when systemd collected the transient unit itself.
            if directory.exists():
                events = dict(row.split() for row in (directory / "cgroup.events").read_text().splitlines())
                if events.get("populated") != "0":
                    raise Refused("model_cgroup_still_populated")
            if observed.get("LoadState") == "not-found":
                return
        if observed.get("ActiveState") not in ("inactive", "failed") or observed.get("MainPID") != "0":
            raise Refused("service_stop_not_confirmed")


def model_group_confirmed(observation):
    return observation.get("ControlGroup") == "/system.slice/ai-deepseek.service" or (
        observation.get("ControlGroup") == "" and observation.get("MainPID") == "0"
        and observation.get("ActiveState") in ("inactive", "failed"))


def no_connections():
    for path in ("/proc/net/tcp", "/proc/net/tcp6"):
        for line in Path(path).read_text().splitlines()[1:]:
            fields = line.split()
            if int(fields[1].split(":")[-1], 16) in (11435, 11436, 11441, 11442) and fields[3] in ("01", "02", "03", "08"):
                raise Refused("affected_backend_has_active_connections")


def private_directory(path):
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077 or path.resolve() != path:
        raise Refused("protected_existing_backup_required")


def verified_input(path, record):
    """Read a pinned source using its original owner, without changing protections.

    Unlike Root-owned backup envelopes and deployment targets, an original model
    runtime legitimately belongs to the model user. Bind content and attributes
    to the authenticated manifest, and check the same open inode before/after.
    """
    if path.resolve() != path:
        raise Refused("verified_input_path_changed")
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_size > 16 * 1024 * 1024:
            raise Refused("verified_input_type_or_size_changed")
        attributes = {"uid": before.st_uid, "gid": before.st_gid,
                      "mode": stat.S_IMODE(before.st_mode), "mtime_ns": before.st_mtime_ns,
                      "xattrs": {key: base64.b64encode(os.getxattr(descriptor, key)).decode()
                                 for key in os.listxattr(descriptor)}}
        if attributes != record["attributes"]:
            raise Refused("verified_input_attributes_changed")
        chunks, size = [], 0
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk: break
            size += len(chunk)
            if size > 16 * 1024 * 1024:
                raise Refused("verified_input_type_or_size_changed")
            chunks.append(chunk)
        after = os.fstat(descriptor)
        current = path.lstat()
        fields = ("st_dev", "st_ino", "st_mode", "st_uid", "st_gid", "st_size", "st_mtime_ns", "st_ctime_ns")
        if any(getattr(before, key) != getattr(observed, key) for observed in (after, current) for key in fields):
            raise Refused("verified_input_changed_during_read")
        content = b"".join(chunks)
        if digest(content) != record["sha256"]:
            raise Refused("verified_input_content_changed")
        return content
    finally:
        os.close(descriptor)


def prepare(assets):
    validate_assets(assets)
    builder = module(assets["netaigis-model-context-candidate.py"], "builder")
    primitives = module(assets["netaigis-coding-agent-adapter-maintenance.py"], "primitives")
    manifests = {}
    for name, (manifest_sha, archive_sha) in BACKUPS.items():
        folder = PARENT / name
        private_directory(folder)
        manifest = primitives["regular"](folder / "manifest.json", True)
        if digest(manifest) != manifest_sha or digest(primitives["regular"](folder / "artifacts.tar", True)) != archive_sha:
            raise Refused("verified_backup_changed")
        manifests[name] = json.loads(manifest)
    inputs, records = {}, {}
    for name, sha in builder["EXPECTED"].items():
        backup = "phase4-dynamic-context-delta" if name in (builder["ROUTER"], builder["CONFIG"]) else "phase4-model-context-preflight"
        path = PARENT / backup / "restore-probe" / name.lstrip("/")
        record = manifests[backup]["files"][name]
        data = verified_input(path, record)
        if digest(data) != sha or record["sha256"] != sha:
            raise Refused("verified_restored_input_changed")
        inputs[name], records[name] = data, record
    public_assets = {name: assets[name] for name in builder["ASSETS"]}
    candidates = builder["build"](inputs, public_assets)
    if {name: digest(data) for name, data in candidates.items()} != CANDIDATES:
        raise Refused("reviewed_candidate_changed")
    return builder, primitives, inputs, records, candidates


def check_targets(primitives, inputs, records, candidates):
    plans = []
    for filename, candidate in candidates.items():
        path = Path(filename)
        if path.parent.resolve() != path.parent or path.parent.stat().st_uid != 0 or path.parent.stat().st_mode & 0o022:
            raise Refused("target_parent_not_protected")
        if filename in records:
            current = primitives["regular"](path)
            if digest(current) not in (digest(inputs[filename]), digest(candidate), *PREVIOUS_CANDIDATES.get(filename, ())):
                raise Refused("unreviewed_current_source", filename)
            attributes = records[filename]["attributes"].copy()
            attributes["xattrs"] = {key: base64.b64decode(value) for key, value in attributes["xattrs"].items()}
            actual = primitives["metadata"](path)
            if any(actual[key] != attributes[key] for key in ("uid", "gid", "mode", "xattrs")):
                raise Refused("current_source_attributes_changed")
            plans.append({"source": path, "attributes": attributes, "current": digest(current), "candidate": candidate})
        elif os.path.lexists(path):
            current = primitives["regular"](path)
            allowed = {digest(candidate), *PREVIOUS_CANDIDATES.get(filename, ())}
            if filename == "/etc/systemd/system/ai-deepseek.service":
                allowed.add(digest(inputs["/run/systemd/transient/ai-deepseek.service"]))
            info = path.stat()
            if digest(current) not in allowed or info.st_uid != 0 or info.st_gid != 0 or stat.S_IMODE(info.st_mode) != 0o644:
                raise Refused("unreviewed_existing_new_target")
            plans.append({"source": path, "current": digest(current), "candidate": candidate, "new": True,
                          "attributes": primitives["metadata"](path)})
        else:
            plans.append({"source": path, "current": None, "candidate": candidate, "new": True})
    return plans


def new_file(path, content):
    # Publish a complete new file atomically without replacing a raced target.
    temporary = path.parent / (".netaigis-context-new-" + uuid.uuid4().hex)
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as target:
            target.write(content); target.flush(); os.fchmod(target.fileno(), 0o644); os.fsync(target.fileno())
        os.link(temporary, path, follow_symlinks=False)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        temporary.unlink()  # Only this invocation's exclusively created staging file.


def observe_or_grow(builder, config, required=None):
    profile = config["runtime_profiles"][builder["PROFILE_ID"]]
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(1900 if required is not None else 3)
        client.connect(profile["control_socket"])
        payload = {"op": "observe"} if required is None else {"op": "ensure_context", "role": "coding", "required": required}
        client.sendall((json.dumps(payload) + "\n").encode())
        with client.makefile("rb") as stream:
            raw = stream.readline(65537)
        if len(raw) > 65536 or not raw.endswith(b"\n"):
            raise Refused("invalid_context_control_response")
        result = json.loads(raw)
    if (result.get("ok") is not True or result.get("state") != "ready" or result.get("model") != config["coding"]["model"]
            or type(result.get("current_context")) is not int or result["current_context"] < (required or 1)):
        raise Refused("context_readiness_not_confirmed")
    return {"model": result["model"], "current_context": result["current_context"]}


def backend_capacity(config):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args): return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    result = []
    for suffix in ("/health", "/v1/models"):
        request = urllib.request.Request(config["coding"]["url"].rstrip("/") + suffix, headers={"Connection": "close"})
        with opener.open(request, timeout=2) as response:
            result.append(json.loads(response.read(65536)))
    health, models = result
    if (health.get("status") != "ok" or health.get("loaded") is not True or type(health.get("max_context")) is not int
            or not any(m.get("id") == config["coding"]["model"] for m in models.get("data", []))):
        raise Refused("selected_backend_not_confirmed_ready")
    return health["max_context"]


def ready(builder, config):
    deadline = time.monotonic() + 920
    while time.monotonic() < deadline:
        current = state("ai-deepseek.service")
        if current.get("ActiveState") == "failed":
            raise Refused("new_model_service_failed")
        if current.get("ActiveState") != "active":
            raise Refused("new_model_service_not_active")
        if current.get("Transient") != "no" or current.get("User") != "friseer" or current.get("FragmentPath") != builder["MODEL_UNIT"]:
            raise Refused("persistent_model_service_not_confirmed")
        try:
            backend_capacity(config)
            result = observe_or_grow(builder, config)
            return result
        except Refused as error:
            if str(error) not in ("selected_backend_not_confirmed_ready", "context_readiness_not_confirmed"):
                raise
            threading.Event().wait(0.25)
        except (OSError, ValueError):
            threading.Event().wait(0.25)
    raise Refused("new_model_readiness_deadline")


def transact(builder, primitives, inputs, records, candidates, *, action, maintenance, external, emergency=False, activity=None):
    activity = activity if activity is not None else new_activity()
    if action not in ("apply", "inspect", "emergency"):
        raise Refused("unsupported_action")
    plans = check_targets(primitives, inputs, records, candidates)
    # The original runtime JSON is intentionally never rewritten.
    try:
        runtime = verified_input(Path(builder["RUNTIME"]), records[builder["RUNTIME"]])
    except Refused:
        raise Refused("selected_runtime_source_changed") from None
    if digest(runtime) != digest(inputs[builder["RUNTIME"]]):
        raise Refused("selected_runtime_source_changed")
    transient = Path(builder["TRANSIENT"])
    if os.path.lexists(transient):
        if digest(primitives["regular"](transient)) != digest(inputs[builder["TRANSIENT"]]):
            raise Refused("existing_model_unit_changed")
    elif not Path(builder["MODEL_UNIT"]).is_file():
        raise Refused("existing_model_unit_not_confirmed")
    if action == "inspect":
        return {"ok": True, "action": action, "candidate_files": CANDIDATES, "source_modified": False, "service_modified": False, "model_request": False}
    if not maintenance or not external:
        raise Refused("confirmed_quiet_window_and_external_restore_required")
    if action == "emergency" and not emergency:
        raise Refused("explicit_emergency_confirmation_required")
    for unit in UNITS:
        primitives["UNIT"] = unit
        primitives["Controller"]().quiet(require_running=action != "emergency")
    if not model_group_confirmed(state("ai-deepseek.service")):
        raise Refused("model_control_group_not_confirmed")
    no_connections()
    protected = state(PROTECTED_UNIT)
    if protected.get("ActiveState") != "active" or protected.get("SubState") != "running":
        raise Refused("learning_service_not_confirmed_running")
    backup = PARENT / "phase4-dynamic-context-delta"
    lock = os.open(backup / "context-activation.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    journal = backup / ("activation-" + uuid.uuid4().hex + ".jsonl")
    stopped = []
    with journal.open("x") as log:
        os.chmod(journal, 0o600)
        def record(value):
            log.write(json.dumps(value) + "\n"); log.flush(); os.fsync(log.fileno())
            print(json.dumps({"progress": True, **value}), flush=True)
        try:
            record({"stage": "checked", "files": CANDIDATES, "learning": protected})
            if action == "emergency":
                restoration = {name: inputs[name] for name in (builder["ROUTER"], builder["CONFIG"], builder["TRACKER"])}
                restoration[builder["MODEL_UNIT"]] = inputs[builder["TRANSIENT"]]
                plans = [{**plan, "candidate": restoration[str(plan["source"])]} for plan in plans if str(plan["source"]) in restoration]
            # Persist the replacement definition and all inputs before stopping the
            # transient service, which can disappear when its process terminates.
            for plan in plans:
                if plan["current"] == digest(plan["candidate"]): continue
                activity["mutation_attempted"] = True
                if plan.get("new") and plan["current"] is None:
                    new_file(plan["source"], plan["candidate"])
                else:
                    primitives["replace_verified"](plan, plan["candidate"], plan["current"])
                activity["file_writes_confirmed"] += 1
                record({"stage": "file_written", "path": str(plan["source"]), "sha256": digest(plan["candidate"])})
            no_connections()
            for unit in UNITS:
                activity["service_action_attempted"] = True
                service("stop", unit); stopped.append(unit); record({"stage": "stopped", "unit": unit})
            service("daemon-reload")
            service("start", "ai-deepseek.service")
            config = json.loads(inputs[builder["CONFIG"]] if action == "emergency" else candidates[builder["CONFIG"]])
            if action == "emergency":
                deadline = time.monotonic() + 920
                while True:
                    try:
                        capacity = backend_capacity(config)
                        if capacity < 32768: raise Refused("emergency_capacity_not_confirmed")
                        grown = {"model": config["coding"]["model"], "current_context": capacity}
                        break
                    except (OSError, ValueError, Refused):
                        if time.monotonic() >= deadline or state("ai-deepseek.service").get("ActiveState") == "failed":
                            raise Refused("emergency_service_not_ready") from None
                        threading.Event().wait(0.25)
                record({"stage": "emergency_original_available", "allocation": grown, "new_version_repair_remains_required": True})
            else:
                record({"stage": "waiting_for_new_model"})
                observation = ready(builder, config)
                record({"stage": "verifying_first_growth", "required_context": 65536})
                # A first actual increase while the request gateways are stopped.
                grown = observe_or_grow(builder, config, 65536)
                if backend_capacity(config) < grown["current_context"]:
                    raise Refused("independent_backend_growth_not_confirmed")
                record({"stage": "actual_growth_confirmed", "before": observation, "after": grown})
            for unit in ("ai-model-router.service", "netaigis-coding-agent.service"):
                service("start", unit)
            for unit in UNITS:
                observed = state(unit)
                if observed.get("ActiveState") != "active" or observed.get("SubState") != "running" or int(observed.get("MainPID", 0)) < 1:
                    raise Refused("gateway_or_model_service_not_running")
            if state(PROTECTED_UNIT) != protected:
                raise Refused("protected_learning_service_changed")
            for plan in plans:
                if digest(primitives["regular"](plan["source"])) != digest(plan["candidate"]):
                    raise Refused("installed_candidate_changed")
            record({"stage": "applied", "allocation": grown})
            return {"ok": True, "action": action, "current_context": grown["current_context"], "model": grown["model"],
                    "journal": str(journal), "source_modified": True, "service_modified": True,
                    "learning_service_unchanged": True, "model_request": False, "inference_acceptance_pending": True,
                    "one_million_allocation_pending": True, "new_version_repair_remains_required": action == "emergency"}
        except BaseException:
            record({**failure_activity(activity), "stage": "repair_required"})
            # Restore availability using the NEW implementation, never silently
            # overwrite it with the original after the first failed check.
            for unit in reversed(stopped):
                try: service("start", unit)
                except Exception: pass
            raise
        finally:
            os.close(lock)


def new_activity():
    return {"mutation_attempted": False, "file_writes_confirmed": 0, "service_action_attempted": False}


def failure_activity(activity):
    result = {**activity, "automatic_rollback": False,
              "stage": "mutation_started" if activity["mutation_attempted"] else "before_mutation",
              "source_modified": None if activity["mutation_attempted"] else False,
              "service_modified": None if activity["service_action_attempted"] else False}
    if activity["file_writes_confirmed"]:
        result["new_implementation_retained"] = True
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("inspect", "apply", "emergency"))
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--maintenance-confirmed", action="store_true")
    parser.add_argument("--external-copy-verified", action="store_true")
    parser.add_argument("--emergency-confirmed", action="store_true")
    options = parser.parse_args()
    assets = globals().get("BUNDLED_ASSETS")
    if assets is None:
        assets = {name: Path(__file__).with_name(name).read_bytes() for name in ASSETS}
    validate_assets(assets)
    if options.remote:
        helper = Path(__file__).with_name("netaigis-coding-agent-adapter-remote.py")
        spec = importlib.util.spec_from_file_location("existing_terminal_transport", helper)
        transport = importlib.util.module_from_spec(spec); spec.loader.exec_module(transport)
        source = Path(__file__).read_bytes()
        payload = {name: base64.b64encode(value).decode() for name, value in assets.items()}
        argv = ["context-activation", options.action]
        if options.maintenance_confirmed: argv.append("--maintenance-confirmed")
        if options.external_copy_verified: argv.append("--external-copy-verified")
        if options.emergency_confirmed: argv.append("--emergency-confirmed")
        program = ("import base64,hashlib,sys; s=base64.b64decode(" + repr(base64.b64encode(source).decode())
                   + "); assert hashlib.sha256(s).hexdigest()==" + repr(digest(source)) + "; sys.argv=" + repr(argv)
                   + "; a={k:base64.b64decode(v) for k,v in " + repr(payload) + ".items()}; "
                   + "exec(compile(s,'public-context-activation','exec'),{'__name__':'__main__','BUNDLED_ASSETS':a})")
        with open("/dev/tty") as terminal:
            return subprocess.call(transport.ssh_command(program), stdin=terminal)
    if os.geteuid() != 0:
        raise SystemExit("Existing Root terminal required for inspect/apply; no password in chat")
    os.umask(0o077)
    activity = new_activity()
    try:
        builder, primitives, inputs, records, candidates = prepare(assets)
        report = transact(builder, primitives, inputs, records, candidates, action=options.action,
                          maintenance=options.maintenance_confirmed, external=options.external_copy_verified,
                          emergency=options.emergency_confirmed, activity=activity)
    except Exception as error:
        report = {"ok": False, "action": options.action, "failure_class": type(error).__name__,
                  "repair_required": True, "model_request": False, **failure_activity(activity)}
        if type(error).__name__ == "Refused" and re.fullmatch(r"[a-z_]{1,120}", str(error)):
            report["reason"] = str(error)
        if isinstance(error, Refused) and error.path in CANDIDATES: report["path"] = error.path
    print(json.dumps(report))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
