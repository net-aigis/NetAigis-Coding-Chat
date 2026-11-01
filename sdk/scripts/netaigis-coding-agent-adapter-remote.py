"""Run the approved Acer adapter operation through the existing SSH/sudo terminal.

Default is inspect. Passwords are entered only into SSH's attached user terminal.
No credentials are read by this launcher or embedded in the public source bundle.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shlex
import subprocess

FILES = {"maintenance": "netaigis-coding-agent-adapter-maintenance.py",
         "finish": "netaigis-coding-agent-finish-reason.py",
         "patch": "netaigis-coding-agent-token-limit.patch"}
DIGESTS = {"maintenance": "724ef51566b333b228c317cad588da0829ebd0f8ee3de1ba6d3c35538b63f47e",
           "finish": "ef0742af72db0418c70282a6227aff77f2db82ea5718e869cefdb5f6dc78cba2",
           "patch": "4607e260ddd664af584d8097cb4ba7e8f7214e0ac6b82760ab706d169b697be9"}


def load_assets(root):
    files = {key: (root / filename).read_bytes() for key, filename in FILES.items()}
    if any(hashlib.sha256(value).hexdigest() != DIGESTS[key] for key, value in files.items()):
        raise ValueError("Public maintenance assets changed; review before root execution")
    return {key: value.decode() for key, value in files.items()}


def remote_program(assets, action, emergency_confirmed=False):
    if action not in ("inspect", "apply", "repair", "rollback"):
        raise ValueError("Unsupported operation")
    if action == "rollback" and not emergency_confirmed:
        raise ValueError("Original restore requires an explicit emergency condition")
    arguments = [action]
    if action != "inspect":
        arguments.append("--maintenance-confirmed")
    if emergency_confirmed:
        arguments.append("--emergency-confirmed")
    bundle = base64.b64encode(json.dumps({"code": assets["maintenance"],
                                         "assets": {key: assets[key] for key in ("finish", "patch")}}).encode()).decode()
    return ('import base64,json,sys; p=json.loads(base64.b64decode(' + repr(bundle) + ')); '
            + 'sys.argv=["acer-adapter-maintenance"]+' + repr(arguments) + '; '
            + 'exec(compile(p["code"],"public-maintenance-helper","exec"),'
            + '{"__name__":"__main__","REPAIR_ASSETS":p["assets"]})')


def ssh_command(program, non_interactive=False):
    sudo = ["sudo", "-n"] if non_interactive else ["sudo"]
    command = " ".join(shlex.quote(value) for value in [*sudo, "python3", "-c", program])
    return ["ssh", "-T" if non_interactive else "-t", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "ConnectTimeout=7", "-o", "ConnectionAttempts=1", "-o", "ControlMaster=no", "-o", "ControlPath=none",
            "friseer@192.168.178.43", command]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("inspect", "apply", "repair", "rollback"), nargs="?", default="inspect")
    parser.add_argument("--emergency-confirmed", action="store_true")
    parser.add_argument("--non-interactive", action="store_true")
    args = parser.parse_args()
    assets = load_assets(Path(__file__).parent)
    command = ssh_command(remote_program(assets, args.action, args.emergency_confirmed), args.non_interactive)
    if args.non_interactive:
        return subprocess.call(command, stdin=subprocess.DEVNULL)
    try:
        terminal = open("/dev/tty")
    except OSError:
        raise SystemExit("A user terminal is required for sudo; enter no password in chat") from None
    with terminal:
        return subprocess.call(command, stdin=terminal)


if __name__ == "__main__":
    raise SystemExit(main())
