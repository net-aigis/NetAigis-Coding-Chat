"""Pinned Acer adapter maintenance, read-only by default.

Apply/repair require productive approval and a confirmed quiet window.
Failures retain the new version for diagnosis and repair. Old-version restore
requires an explicit emergency condition; it is never an automatic first response.
Private adapter bytes and backup artifacts stay on Acer. No model requests,
configuration writes or control of Learning-Agent/model/Recall services.
"""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time
import urllib.error
import urllib.request
import uuid

SOURCE = Path("/opt/netaigis-coding-agent/ollama_adapter.py")
BACKUP = Path("/root/netaigis-recall-backups/phase2-20261030T165000Z/phase4-ollama-adapter-preflight")
BEFORE = "cdf5d6768d8fffb9e3d1d0f4b08db9784a5ce5b432003f4cf16d4f3a970c8b81"
AFTER = "307497023baea81eabda77d96045c81fecc605a296748dc0ad163f7e01c4ffd9"
PREVIOUS_CANDIDATES = ()  # Add only a previously verified hash for a later targeted correction.
MANIFEST = "2e70f16496d30d3c2eac5308e59b366ee36ba8137ba47f90329c51bec9cbad83"
ARCHIVE = "a6bbd6a964f89050b30bb0ece1071f844f6b9fc49ab2b5112ffc9ea11a640af3"
ASSETS = {"finish": "ef0742af72db0418c70282a6227aff77f2db82ea5718e869cefdb5f6dc78cba2",
          "patch": "4607e260ddd664af584d8097cb4ba7e8f7214e0ac6b82760ab706d169b697be9"}
UNIT = "netaigis-coding-agent.service"
STATE_PROPERTIES = ("LoadState", "ActiveState", "SubState", "MainPID", "InvocationID",
                    "Result", "ExecMainCode", "ExecMainStatus", "NRestarts")
ISOLATION_PROPERTIES = ("RequiredBy", "BoundBy", "ConsistsOf", "PropagatesStopTo", "OnFailure",
                        "ExecStop", "ExecStopPost", "ExecStartPre", "ExecStartPost")
HOOK_PROPERTIES = ISOLATION_PROPERTIES[5:]
CONFIG = ["/etc/netaigis-coding-agent/recall.env", "/etc/netaigis-coding-agent/recall-actors.env",
          "/etc/systemd/system/netaigis-coding-agent.service",
          *["/etc/systemd/system/netaigis-coding-agent.service.d/" + name
            for name in ("recall.conf", "recall-actors.conf", "model-router.conf")]]


class Refused(Exception):
    """Public failure code only, never private file contents or exception payloads."""


def digest(value):
    return hashlib.sha256(value).hexdigest()


def metadata(path):
    info = path.stat()
    return {"uid": info.st_uid, "gid": info.st_gid, "mode": stat.S_IMODE(info.st_mode),
            "mtime_ns": info.st_mtime_ns,
            "xattrs": {key: os.getxattr(path, key) for key in os.listxattr(path)}}


def regular(path, private=False):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or (private and info.st_mode & 0o077):
        raise Refused("file_owner_type_or_protection_changed")
    return path.read_bytes()


def build_candidate(original, assets):
    if digest(original) != BEFORE or any(digest(assets[key].encode()) != value for key, value in ASSETS.items()):
        raise Refused("source_or_public_repair_assets_changed")
    namespace = {"__name__": "pinned_public_finish_rewriter"}
    exec(compile(assets["finish"], "public-finish-rewriter", "exec"), namespace)
    candidate = namespace["rewrite"](original)
    # Exact one-hunk application in memory; no fuzz, file copy or service import.
    header, hunk = assets["patch"].split("@@ -71,4 +71,12 @@\n", 1)
    if header != "--- a/ollama_adapter.py\n+++ b/ollama_adapter.py\n":
        raise Refused("patch_header_changed")
    lines = hunk.splitlines(keepends=True)
    old = "".join(line[1:] for line in lines if line.startswith((" ", "-"))).encode()
    new = "".join(line[1:] for line in lines if line.startswith((" ", "+"))).encode()
    offset = sum(map(len, candidate.splitlines(keepends=True)[:70]))
    if candidate[offset:offset + len(old)] != old:
        raise Refused("patch_context_changed")
    candidate = candidate[:offset] + new + candidate[offset + len(old):]
    if digest(candidate) != AFTER:
        raise Refused("combined_candidate_changed")
    ast.parse(candidate)
    compile(candidate, "verified-adapter-candidate", "exec")
    return candidate


def verify(source, backup, candidate, expected=None):
    expected = expected or {"before": BEFORE, "after": AFTER, "manifest": MANIFEST, "archive": ARCHIVE,
                            "previous": PREVIOUS_CANDIDATES}
    if backup.is_symlink() or not backup.is_dir() or backup.stat().st_uid != os.geteuid() or backup.stat().st_mode & 0o077:
        raise Refused("backup_directory_not_protected")
    manifest_bytes = regular(backup / "manifest.json", True)
    if digest(manifest_bytes) != expected["manifest"] or digest(regular(backup / "adapter.tar", True)) != expected["archive"]:
        raise Refused("backup_checksums_changed")
    manifest = json.loads(manifest_bytes)
    if manifest != {"source": str(source), "source_sha256": expected["before"], "archive_sha256": expected["archive"],
                    "restore_verified": True, "owner_mode_verified": True, "mtime_xattrs_verified": True,
                    "source_modified": False, "service_modified": False, "model_request": False}:
        raise Refused("backup_manifest_changed")
    lines = regular(backup / "SHA256SUMS", True).decode().splitlines()
    if len(lines) != 3 or any(not re.fullmatch(r"[a-f0-9]{64}  [^\n]+", line) for line in lines):
        raise Refused("backup_checksum_list_changed")
    sums = {name: value for value, name in (line.split("  ", 1) for line in lines)}
    if sums != {"adapter.tar": expected["archive"], "manifest.json": expected["manifest"],
                f"restore-probe/{source.name}": expected["before"]}:
        raise Refused("backup_checksum_list_changed")
    original_path = backup / "restore-probe" / source.name
    if original_path.parent.is_symlink():
        raise Refused("restore_directory_is_symlink")
    original = regular(original_path)
    current = regular(source)
    if digest(original) != expected["before"] or digest(candidate) != expected["after"] or digest(current) not in (expected["before"], expected["after"], *expected.get("previous", ())):
        raise Refused("source_candidate_or_restored_bytes_changed")
    if source.parent.is_symlink() or source.parent.stat().st_uid != os.geteuid() or source.parent.stat().st_mode & 0o022:
        raise Refused("source_parent_is_not_owned_and_protected")
    for data in (original, candidate):
        ast.parse(data)
    attributes = metadata(original_path)
    actual = metadata(source)
    fields = attributes.keys() if current == original else ("uid", "gid", "mode", "xattrs")
    if any(attributes[key] != actual[key] for key in fields):
        raise Refused("source_metadata_changed")
    return {"source": source, "backup": backup, "original": original, "candidate": candidate,
            "attributes": attributes, "expected": expected}


def replace_verified(plan, content, expected_hash, restore_time=False):
    source = plan["source"]
    if digest(regular(source)) != expected_hash:
        raise Refused("concurrent_source_change")
    def check_attributes():
        actual = metadata(source)
        if any(actual[key] != plan["attributes"][key] for key in ("uid", "gid", "mode", "xattrs")):
            raise Refused("concurrent_source_metadata_change")
    check_attributes()
    temporary = source.parent / (".ollama-adapter-phase4-" + uuid.uuid4().hex)
    created = False
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        created = True
        with os.fdopen(descriptor, "wb") as target:
            target.write(content)
            target.flush()
            os.fchown(target.fileno(), plan["attributes"]["uid"], plan["attributes"]["gid"])
            os.fchmod(target.fileno(), plan["attributes"]["mode"])
            for key in set(os.listxattr(temporary)) - plan["attributes"]["xattrs"].keys():
                os.removexattr(temporary, key)
            for key, value in plan["attributes"]["xattrs"].items():
                os.setxattr(temporary, key, value)
            if restore_time:
                stamp = plan["attributes"]["mtime_ns"]
                os.utime(temporary, ns=(stamp, stamp))
            os.fsync(target.fileno())
        temporary_attributes = metadata(temporary)
        fields = ("uid", "gid", "mode", "mtime_ns", "xattrs") if restore_time else ("uid", "gid", "mode", "xattrs")
        if any(temporary_attributes[key] != plan["attributes"][key] for key in fields):
            raise Refused("replacement_metadata_not_preserved")
        if digest(regular(source)) != expected_hash:
            raise Refused("concurrent_source_change")
        check_attributes()
        os.replace(temporary, source)
        directory = os.open(source.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        if digest(regular(source)) != digest(content):
            raise Refused("installed_bytes_differ")
    finally:
        if created and temporary.exists():
            temporary.unlink()  # Only this invocation's exclusive temporary file.


class Controller:
    def command(self, action):
        if action not in ("start", "stop"):
            raise Refused("unsupported_service_action")
        result = subprocess.run(["systemctl", "--no-ask-password", "--no-pager", action, UNIT],
                                capture_output=True, timeout=35, check=False)
        if result.returncode:
            raise Refused("coding_service_" + action + "_failed")

    def show(self):
        result = subprocess.run(["systemctl", "--no-ask-password", "--no-pager", "--all", "show", UNIT,
                                 "--property=" + ",".join(STATE_PROPERTIES + ISOLATION_PROPERTIES)],
                                capture_output=True, timeout=10, check=True, text=True)
        return dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)

    def details(self):
        details = self.show()
        missing = [key for key in HOOK_PROPERTIES if key not in details]
        if missing:
            # systemctl omits empty command arrays even with --all. Read the
            # typed property instead of equating missing output with no hook.
            command = ["busctl", "--system", "--json=short"]
            result = subprocess.run([*command, "call", "org.freedesktop.systemd1", "/org/freedesktop/systemd1",
                                     "org.freedesktop.systemd1.Manager", "GetUnit", "s", UNIT],
                                    capture_output=True, timeout=8, check=True, text=True)
            value = json.loads(result.stdout)
            data = value.get("data")
            if value.get("type") != "o" or not isinstance(data, list) or len(data) != 1 or not isinstance(data[0], str) or not data[0].startswith("/org/freedesktop/systemd1/unit/"):
                raise Refused("typed_unit_identity_unconfirmed")
            for key in missing:
                result = subprocess.run([*command, "get-property", "org.freedesktop.systemd1", data[0],
                                         "org.freedesktop.systemd1.Service", key],
                                        capture_output=True, timeout=8, check=True, text=True)
                value = json.loads(result.stdout)
                if value.get("type") != "a(sasbttttuii)" or not isinstance(value.get("data"), list):
                    raise Refused("typed_service_hook_unconfirmed")
                details[key] = "configured" if value["data"] else ""
        return details

    def state(self):
        details = self.show()
        return {key: details.get(key) for key in STATE_PROPERTIES}

    def quiet(self, require_running=True):
        state = self.details()
        if any(key not in state or state[key] for key in ISOLATION_PROPERTIES):
            raise Refused("isolated_stop_start_is_not_confirmed")
        running = state.get("ActiveState") == "active" and state.get("SubState") == "running" and int(state.get("MainPID", "0")) > 0
        stopped = state.get("ActiveState") in ("inactive", "failed") and state.get("MainPID") == "0"
        if state.get("LoadState") != "loaded" or not (running or (not require_running and stopped)):
            raise Refused("coding_service_not_running_before_maintenance")
        for filename in ("/proc/net/tcp", "/proc/net/tcp6"):
            for line in Path(filename).read_text().splitlines()[1:]:
                fields = line.split()
                if fields[3] in ("01", "03", "08") and int(fields[1].split(":")[-1], 16) == 11436:
                    raise Refused("coding_service_has_established_connections")

    def stop(self):
        self.command("stop")
        state = self.state()
        if state.get("ActiveState") != "inactive" or state.get("MainPID") != "0":
            raise Refused("coding_service_stop_not_confirmed")

    def start(self):
        self.command("start")

    def healthy(self):
        # Bounded startup readiness, never a model turn or an ambient proxy request.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, request, fp, code, message, headers, new_url):
                return None
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        deadline = time.monotonic() + 10
        self.last_health_observation = {}
        while time.monotonic() < deadline:
            try:
                request = urllib.request.Request("http://127.0.0.1:11436/health", headers={"Connection": "close"})
                with opener.open(request, timeout=2) as response:
                    body = json.loads(response.read(65536))
                    self.last_health_observation = {"http_status": response.status,
                                                    "status_ok": isinstance(body, dict) and body.get("status") == "ok"}
                    if response.status == 200 and isinstance(body, dict) and body.get("status") == "ok":
                        state = self.state()
                        if state.get("ActiveState") == "active" and int(state.get("MainPID", "0")) > 0:
                            return state
            except Exception as error:
                self.last_health_observation = {"error_type": type(error).__name__}
                if isinstance(error, urllib.error.HTTPError):
                    self.last_health_observation["http_status"] = error.code
            time.sleep(0.2)
        raise Refused("coding_service_health_not_confirmed")

    def configuration(self):
        return {path: digest(Path(path).read_bytes()) for path in CONFIG}

    def diagnostics(self, since):
        """Only error classes and relevant source locations leave the Acer journal."""
        result = subprocess.run(["journalctl", "--no-pager", "--unit=" + UNIT, "--since=@" + str(since),
                                 "--lines=100", "--output=json"],
                                capture_output=True, timeout=10, check=True, text=True)
        exceptions, frames = [], []
        for line in result.stdout.splitlines():
            message = json.loads(line).get("MESSAGE", "")
            if not isinstance(message, str):
                continue
            exceptions.extend(re.findall(r"\b([A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception)):", message))
            for filename, number in re.findall(r'File "([^"]+)", line ([0-9]+)', message):
                if Path(filename).name in ("app.py", "ollama_adapter.py"):
                    frames.append({"file": Path(filename).name, "line": int(number)})
        return {"exception_classes": sorted(set(exceptions)), "source_locations": frames,
                "last_health": getattr(self, "last_health_observation", {}), "raw_journal_output": False}


def transact(plan, controller, action, maintenance_confirmed=False, emergency_confirmed=False):
    if not maintenance_confirmed or action not in ("apply", "repair", "rollback"):
        raise Refused("explicit_quiet_maintenance_confirmation_required")
    if action == "rollback" and not emergency_confirmed:
        raise Refused("explicit_emergency_condition_required_for_original_restore")
    plan = verify(plan["source"], plan["backup"], plan["candidate"], plan["expected"])
    current_hash = digest(regular(plan["source"]))
    allowed = {plan["expected"]["before"]} if action == "apply" else {
        plan["expected"]["before"], plan["expected"]["after"], *plan["expected"].get("previous", ())}
    if current_hash not in allowed or (action == "rollback" and current_hash == plan["expected"]["before"]):
        raise Refused("source_does_not_match_requested_action")
    expected = current_hash
    if action == "apply":
        controller.healthy()
    controller.quiet(require_running=action == "apply")
    configuration = controller.configuration()
    since = int(time.time())
    prefix = "rollback" if action == "rollback" else "application"
    journal = plan["backup"] / f"{prefix}-{time.time_ns()}-{uuid.uuid4().hex}.jsonl"
    with journal.open("x") as record:
        os.fchmod(record.fileno(), 0o600)
        def event(stage):
            record.write(json.dumps({"stage": stage, "time_ns": time.time_ns(),
                                     "source_sha256": digest(regular(plan["source"]))}) + "\n")
            record.flush()
            os.fsync(record.fileno())
        event("validated")
        try:
            controller.stop()
            event("service_stopped")
            content = plan["original"] if action == "rollback" else plan["candidate"]
            replace_verified(plan, content, expected, restore_time=action == "rollback")
            event("source_installed")
            if controller.configuration() != configuration:
                raise Refused("service_configuration_changed_during_maintenance")
            controller.quiet(require_running=False)
            controller.start()
            state = controller.healthy()
            if controller.configuration() != configuration:
                raise Refused("service_configuration_changed_during_maintenance")
            event("healthy")
            return {"ok": True, "action": action, "source_sha256": digest(content), "coding_service": state,
                    "configuration_bytes_unchanged": True, "model_request": False, "journal": str(journal)}
        except Exception as failure:
            report = {"ok": False, "action": action, "repair_required": True, "automatic_restore": False,
                      "failure": str(failure) if isinstance(failure, Refused) else type(failure).__name__,
                      "journal": str(journal)}
            try:
                current = digest(regular(plan["source"]))
                report["source_sha256"] = current
                report["new_version_installed"] = current == plan["expected"]["after"]
                event("repair_required_without_automatic_restore")
            except Exception:
                report["source_state"] = "unknown"
            try:
                report["coding_service"] = controller.state()
                report["diagnostics"] = controller.diagnostics(since)
            except Exception as observation_error:
                report["diagnostics_error_type"] = type(observation_error).__name__
            return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("inspect", "apply", "repair", "rollback"), nargs="?", default="inspect")
    parser.add_argument("--maintenance-confirmed", action="store_true")
    parser.add_argument("--emergency-confirmed", action="store_true")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise Refused("root_required_for_existing_protected_backup")
    assets = globals().get("REPAIR_ASSETS")
    if assets is None:
        base = Path(__file__).parent
        assets = {"finish": (base / "netaigis-coding-agent-finish-reason.py").read_text(),
                  "patch": (base / "netaigis-coding-agent-token-limit.patch").read_text()}
    original = regular(BACKUP / "restore-probe" / SOURCE.name)
    candidate = build_candidate(original, assets)
    plan = verify(SOURCE, BACKUP, candidate)
    if args.action == "inspect":
        return {"ok": True, "action": "inspect", "source_sha256": digest(regular(SOURCE)),
                "candidate_sha256": digest(candidate), "root_backup_verified": True,
                "source_modified": False, "service_modified": False, "model_request": False}
    return transact(plan, Controller(), args.action, args.maintenance_confirmed, args.emergency_confirmed)


if __name__ == "__main__":
    os.umask(0o077)
    try:
        result = main()
    except Exception as error:
        result = {"ok": False, "failure": str(error) if isinstance(error, Refused) else type(error).__name__}
    print(json.dumps(result))
    raise SystemExit(0 if result["ok"] else 1)
