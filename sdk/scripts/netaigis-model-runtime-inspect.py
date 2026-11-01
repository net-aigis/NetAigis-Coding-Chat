"""Read-only owner/profile evidence for an existing model service.

No start, stop, restart, model request, profile creation or configuration write.
--remote uses the existing user-terminal SSH/sudo route; passwords stay there.
Only profiles referencing the specified existing runtime config are reported.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess

CLI = "/home/friseer/.local/bin/strata"
PROPERTIES = "User,Group,ActiveState,SubState,MainPID,InvocationID,Transient"


def inspect(unit, runtime_config, run=subprocess.run, uid=os.geteuid):
    if not re.fullmatch(r"[A-Za-z0-9@._-]+\.service", unit) or not Path(runtime_config).is_absolute():
        raise ValueError("An explicit service and absolute existing runtime config are required")
    if uid() != 0:
        return {"ok": False, "reason": "root_profile_visibility_required", "source_modified": False}

    def state():
        result = run(["systemctl", "show", unit, "--property=" + PROPERTIES],
                     capture_output=True, text=True, timeout=10, check=True)
        return dict(row.split("=", 1) for row in result.stdout.splitlines() if "=" in row)

    before = state()
    result = run([CLI, "profile", "list", "--json"], capture_output=True, text=True, timeout=15)
    try:
        listed = json.loads(result.stdout)
    except ValueError:
        listed = {}
    if not isinstance(listed, dict):
        listed = {}
    profiles = listed.get("profiles")
    valid = result.returncode == 0 and listed.get("ok") is True and isinstance(profiles, list)
    matches = [{key: profile.get(key) for key in ("id", "revision", "source_config")}
               for profile in (profiles if valid else [])
               if valid and isinstance(profile, dict) and profile.get("source_config") == runtime_config]
    after = state()
    return {"ok": valid and before == after, "euid": uid(), "service": unit, "state": after,
            "service_state_stable": before == after, "profile_query_ok": valid,
            "matching_profiles": matches, "root_profile_count": len(listed.get("profiles", [])) if valid else None,
            "runtime_config": runtime_config, "source_modified": False, "configuration_modified": False,
            "service_modified": False, "model_request": False}


def remote_program(source, unit, runtime_config):
    arguments = ["root-model-runtime-inspection", "--unit", unit, "--runtime-config", runtime_config]
    return ("import base64,hashlib,sys; s=base64.b64decode(" + repr(base64.b64encode(source).decode()) + "); "
            + "assert hashlib.sha256(s).hexdigest()==" + repr(hashlib.sha256(source).hexdigest()) + "; "
            + "sys.argv=" + repr(arguments) + "; exec(compile(s,'public-readonly-model-inspector','exec'),{'__name__':'__main__'})")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--unit", required=True)
    parser.add_argument("--runtime-config", required=True)
    parser.add_argument("--remote", action="store_true")
    args = parser.parse_args()
    if args.remote:
        helper = Path(__file__).with_name("netaigis-coding-agent-adapter-remote.py")
        spec = importlib.util.spec_from_file_location("approved_terminal_transport", helper)
        transport = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(transport)
        command = transport.ssh_command(remote_program(Path(__file__).read_bytes(), args.unit, args.runtime_config))
        try:
            terminal = open("/dev/tty")
        except OSError:
            raise SystemExit("Use the existing user terminal for sudo; enter no password in chat") from None
        with terminal:
            return subprocess.call(command, stdin=terminal)
    try:
        report = inspect(args.unit, args.runtime_config)
    except (OSError, ValueError, TypeError, subprocess.SubprocessError) as error:
        report = {"ok": False, "reason": type(error).__name__, "source_modified": False,
                  "configuration_modified": False, "service_modified": False, "model_request": False}
    print(json.dumps(report))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
