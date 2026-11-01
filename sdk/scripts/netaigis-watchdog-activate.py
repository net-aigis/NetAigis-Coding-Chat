"""Install only the independent infrastructure observer through the existing Root terminal.

No model calls or control of Coding/Learning/router/model services. Previous
files are never overwritten; failed deployment retains evidence for repair.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import uuid

ASSETS = {
    "netaigis-watchdog.py": "6042801274ea6eaf7ac51a706be3fbfb5902ea51fe8d1150214d08b545ad128b",
    "netaigis-watchdog.service": "8c9757a19f1278c6256c2234b58d3cf631b4e2d68b08fc4e35e531bcf1fb3e4e",
    "netaigis-watchdog.timer": "4ec7bbc8cd830ef8fae40b381a79271e6f9ee0936b3b5b83e36632298da2c13c",
}
TARGETS = {
    "netaigis-watchdog.py": Path("/usr/local/libexec/netaigis-watchdog.py"),
    "netaigis-watchdog.service": Path("/etc/systemd/system/netaigis-watchdog.service"),
    "netaigis-watchdog.timer": Path("/etc/systemd/system/netaigis-watchdog.timer"),
}
RECORD_DIR = Path("/root/netaigis-recall-backups/phase2-20261030T165000Z/phase4-dynamic-context-delta")
WATCHDOG = "netaigis-watchdog.service"
TIMER = "netaigis-watchdog.timer"
TIMER_LINK = Path("/etc/systemd/system/timers.target.wants/netaigis-watchdog.timer")
MONITORED = ("netaigis-coding-agent.service", "ai-agent.service", "ai-model-router.service", "ai-deepseek.service")


class Refused(RuntimeError):
    pass


def digest(value):
    return hashlib.sha256(value).hexdigest()


def validate_assets(assets):
    if set(assets) != set(ASSETS) or any(digest(assets[name]) != sha for name, sha in ASSETS.items()):
        raise Refused("reviewed_watchdog_assets_changed")


def query(unit):
    if unit not in (*MONITORED, WATCHDOG, TIMER):
        raise Refused("unit_outside_observation_scope")
    result = subprocess.run(["systemctl", "--no-pager", "--no-ask-password", "show", unit,
                             "--property=LoadState,ActiveState,SubState,MainPID,InvocationID,Result,ExecMainStatus,FragmentPath,UnitFileState"],
                            capture_output=True, text=True, timeout=8, check=True)
    return dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)


def control(action, unit=None):
    if (action, unit) not in (("daemon-reload", None), ("start", WATCHDOG), ("enable", TIMER)):
        raise Refused("only_watchdog_control_allowed")
    command = ["systemctl", "--no-pager", "--no-ask-password", action]
    if action == "enable": command.append("--now")
    if unit: command.append(unit)
    result = subprocess.run(command, capture_output=True, timeout=100, check=False)
    if result.returncode and (action, unit) != ("start", WATCHDOG):
        raise Refused("watchdog_service_action_failed")
    return result.returncode


def protected_directory(path, private=False):
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or path.resolve() != path or info.st_uid != os.geteuid()
            or info.st_mode & (0o077 if private else 0o022)):
        raise Refused("watchdog_parent_not_protected")


def check_targets(assets):
    absent = []
    for name, path in TARGETS.items():
        if not path.parent.exists():
            if name != "netaigis-watchdog.py": raise Refused("systemd_directory_missing")
            protected_directory(path.parent.parent)
        else:
            protected_directory(path.parent)
        if not os.path.lexists(path):
            absent.append(name)
            continue
        info = path.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_gid != 0
                or stat.S_IMODE(info.st_mode) != 0o644 or digest(path.read_bytes()) != ASSETS[name]):
            raise Refused("unreviewed_watchdog_target_exists")
    check_timer_link()
    for name, unit in (("netaigis-watchdog.service", WATCHDOG), ("netaigis-watchdog.timer", TIMER)):
        observed = query(unit)
        if observed.get("LoadState") != "not-found" and observed.get("FragmentPath") != str(TARGETS[name]):
            raise Refused("watchdog_unit_collision")
    return absent


def check_timer_link():
    if TIMER_LINK.parent.exists(): protected_directory(TIMER_LINK.parent)
    if os.path.lexists(TIMER_LINK):
        info = TIMER_LINK.lstat()
        if (not stat.S_ISLNK(info.st_mode) or info.st_uid != os.geteuid()
                or TIMER_LINK.resolve() != TARGETS["netaigis-watchdog.timer"]):
            raise Refused("watchdog_timer_enable_link_collision")


def publish(path, content):
    temporary = path.parent / (".netaigis-watchdog-" + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(content); output.flush(); os.fchmod(output.fileno(), 0o644); os.fsync(output.fileno())
        os.link(temporary, path, follow_symlinks=False)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        temporary.unlink()  # Only this invocation's exclusively created staging file.


def read_probe(invocation):
    if not re.fullmatch(r"[0-9a-f]{32}", invocation):
        raise Refused("watchdog_invocation_not_confirmed")
    result = subprocess.run(["journalctl", "--no-pager", "-o", "cat", "_SYSTEMD_INVOCATION_ID=" + invocation],
                            capture_output=True, text=True, timeout=10, check=True)
    values = []
    for line in result.stdout.splitlines():
        try: value = json.loads(line)
        except ValueError: continue
        if isinstance(value, dict) and value.get("component") == "netaigis-watchdog": values.append(value)
    if len(values) != 1 or values[0].get("version") != 1:
        raise Refused("structured_watchdog_observation_missing")
    observations = values[0].get("observations", [])
    if (len(observations) != len(MONITORED) or {row.get("unit") for row in observations} != set(MONITORED)
            or any(row.get("state") not in ("healthy", "unhealthy", "unknown") for row in observations)):
        raise Refused("watchdog_observation_incomplete")
    return values[0]


def apply(assets, approved=False):
    if not approved:
        raise Refused("separate_watchdog_installation_approval_required")
    validate_assets(assets)
    protected_directory(RECORD_DIR, True)
    absent = check_targets(assets)
    before = {unit: query(unit) for unit in MONITORED}
    journal = RECORD_DIR / ("watchdog-activation-" + uuid.uuid4().hex + ".jsonl")
    with journal.open("x") as output:
        os.chmod(journal, 0o600)
        def record(value):
            output.write(json.dumps(value) + "\n"); output.flush(); os.fsync(output.fileno())
            print(json.dumps({"progress": True, **value}), flush=True)
        # Absence is the current protected state: there is no older watchdog
        # module/unit to overwrite or recreate. Existing model backups stay intact.
        record({"stage": "checked", "absent_targets": absent, "assets": ASSETS, "monitored_before": before,
                "timer_enable_link_preexisting": os.path.lexists(TIMER_LINK)})
        written = []
        attempted = False
        try:
            for name in absent:
                path = TARGETS[name]
                if not path.parent.exists(): path.parent.mkdir(mode=0o755)
                protected_directory(path.parent)
                attempted = True
                publish(path, assets[name])
                written.append(name)
                record({"stage": "file_written", "asset": name, "sha256": ASSETS[name]})
            control("daemon-reload")
            control("start", WATCHDOG)
            service = query(WATCHDOG)
            if service.get("ExecMainStatus") not in ("0", "1") or service.get("ActiveState") not in ("inactive", "failed"):
                raise Refused("watchdog_process_completion_unconfirmed")
            observation = read_probe(service.get("InvocationID", ""))
            healthy = all(row["state"] == "healthy" for row in observation["observations"])
            if service["ExecMainStatus"] != ("0" if healthy else "1"):
                raise Refused("watchdog_exit_disagrees_with_observation")
            record({"stage": "independent_service_probe", "invocation": service["InvocationID"], "observation": observation})
            control("enable", TIMER)
            timer = query(TIMER)
            if timer.get("ActiveState") != "active" or timer.get("UnitFileState") != "enabled":
                raise Refused("independent_watchdog_timer_not_active")
            after = {unit: query(unit) for unit in MONITORED}
            if before != after:
                raise Refused("monitored_service_state_changed_during_installation")
            if check_targets(assets): raise Refused("installed_watchdog_files_incomplete")
            result = {"ok": True, "component": "independent_watchdog", "timer_active": True,
                      "probe_states": {row["unit"]: row["state"] for row in observation["observations"]},
                      "monitored_services_unchanged": True, "model_request": False, "journal": str(journal),
                      "continuous_timer_acceptance_pending": True}
            record({"stage": "installed", **result})
            return result
        except Exception:
            record({"stage": "repair_required", "confirmed_file_writes": written,
                    "file_write_attempted": attempted, "automatic_rollback": False})
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("apply",))
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--installation-approved", action="store_true")
    options = parser.parse_args()
    assets = globals().get("BUNDLED_ASSETS") or {name: Path(__file__).with_name(name).read_bytes() for name in ASSETS}
    validate_assets(assets)
    if options.remote:
        path = Path(__file__).with_name("netaigis-coding-agent-adapter-remote.py")
        spec = importlib.util.spec_from_file_location("existing_watchdog_terminal_transport", path)
        transport = importlib.util.module_from_spec(spec); spec.loader.exec_module(transport)
        source = Path(__file__).read_bytes()
        argv = ["watchdog-activation", options.action]
        if options.installation_approved: argv.append("--installation-approved")
        payload = {name: base64.b64encode(data).decode() for name, data in assets.items()}
        program = ("import base64,hashlib,sys; s=base64.b64decode(" + repr(base64.b64encode(source).decode())
                   + "); assert hashlib.sha256(s).hexdigest()==" + repr(digest(source)) + "; sys.argv=" + repr(argv)
                   + "; a={k:base64.b64decode(v) for k,v in " + repr(payload) + ".items()}; "
                   + "exec(compile(s,'public-watchdog-activation','exec'),{'__name__':'__main__','BUNDLED_ASSETS':a})")
        with open("/dev/tty") as terminal: return subprocess.call(transport.ssh_command(program), stdin=terminal)
    if os.geteuid() != 0: raise SystemExit("Existing Root terminal required; no password in chat")
    os.umask(0o077)
    try:
        report = apply(assets, options.installation_approved)
    except Exception as error:
        report = {"ok": False, "failure_class": type(error).__name__, "repair_required": True,
                  "model_request": False, "automatic_rollback": False}
        if isinstance(error, Refused) and re.fullmatch(r"[a-z_]{1,120}", str(error)): report["reason"] = str(error)
    print(json.dumps(report))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
