"""Activate the existing router against the already selected, running model.

Default inspect is read-only. Apply/repair changes only the two backed-up router
files and stop/starts only ai-model-router.service. No model/Learning/Coding
service restart, extension installation, new model selection or context claim.
"""
import argparse
import ast
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.request
import uuid

BACKUP = Path("/root/netaigis-recall-backups/phase2-20261030T165000Z/phase4-model-context-preflight")
MANIFEST = "6fb8ad9472f47875d01a35b4a3b73284951eeb5dc85048363255563824f36677"
ARCHIVE = "49603207964cb3d37613f38797e7abf33cfeae2a895586be80ddf02433b5cf16"
ROUTER = Path("/opt/ai-model-router/model_router.py")
CONFIG = Path("/etc/ai-model-router.json")
RUNTIME = Path("/home/friseer/ai-staging/deepseek-v4.1-flash-1017-iq2_xs/deepseek-runtime-32k.json")
UNIT = "ai-model-router.service"
ASSETS = {"maintenance": ("netaigis-coding-agent-adapter-maintenance.py", "724ef51566b333b228c317cad588da0829ebd0f8ee3de1ba6d3c35538b63f47e"),
          "protocol": ("netaigis-model-router-protocol.py", "90ef8a88981e1ca656f95876799b3d150723b9b9fb1b2536ed78311487f478d5")}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def public_failure(error):
    result = {"failure_class": type(error).__name__}
    # Only our explicit validation messages/codes, never arbitrary exception bodies.
    known = {
        "Public activation assets changed", "Existing context-launch anchor changed",
        "Running-model configuration is not explicit loopback", "Existing route provider changed",
        "Protected verified backup required", "Verified backup checksums changed", "Verified restored source changed",
        "Selected running-model configuration changed", "Unreviewed router change; no overwrite permitted",
        "Source permissions or ownership changed", "Previously selected model is not confirmed running",
        "Confirmed quiet window and verified external restore are required", "Router still has active connections",
        "Protected agents or model are not confirmed running", "Activated router health not confirmed",
        "Protected service or configuration changed",
    }
    if type(error) is ValueError and str(error) in known:
        result["reason"] = str(error)
    elif type(error).__name__ == "Refused":
        text = str(error)
        if re.fullmatch(r"[a-z_]{1,120}", text):
            result["reason"] = text
    if isinstance(error, urllib.error.HTTPError):
        result["http_status"] = error.code
    return result


def load_assets():
    result = {}
    for key, (name, expected) in ASSETS.items():
        source = Path(__file__).with_name(name).read_bytes()
        if digest(source) != expected:
            raise ValueError("Public activation assets changed")
        result[key] = source.decode()
    return result


def build(router, config_source, runtime_source, protocol):
    patch = {"__name__": "public_router_protocol_rewriter"}
    exec(compile(protocol, "public-router-protocol", "exec"), patch)
    candidate = patch["rewrite"](router)
    # A mismatched legacy launcher must never download/restart the old model.
    function = next(node for node in ast.parse(candidate).body if isinstance(node, ast.FunctionDef) and node.name == "increase_context")
    anchors = [node for node in function.body if isinstance(node, ast.Assign)
               and any(isinstance(target, ast.Name) and target.id == "args" for target in node.targets)]
    if len(anchors) != 1:
        raise ValueError("Existing context-launch anchor changed")
    anchor = anchors[0]
    lines = candidate.splitlines(keepends=True)
    offset = sum(map(len, lines[:anchor.lineno - 1]))
    indent = b" " * anchor.col_offset
    guard = (indent + b'if opts.get("model_id") != CONFIG["coding"]["model"]:\n'
             + indent + b'    raise RuntimeError("The active model has no verified context-growth launcher")\n')
    candidate = candidate[:offset] + guard + candidate[offset:]
    compile(candidate, "verified-router-activation-candidate", "exec")
    config = json.loads(config_source)
    runtime = json.loads(runtime_source)
    model, host, port = runtime.get("model_name"), runtime.get("host"), runtime.get("port")
    if not isinstance(model, str) or not model or host not in ("127.0.0.1", "localhost", "::1") or type(port) is not int or not 1 <= port <= 65535:
        raise ValueError("Running-model configuration is not explicit loopback")
    previous = config["coding"]["model"]
    for role in ("coding", "learning"):
        if config[role].get("provider") != "strata":
            raise ValueError("Existing route provider changed")
        config[role]["url"] = "http://" + ("[" + host + "]" if host == "::1" else host) + ":" + str(port)
        config[role]["model"] = model
    config["coding"]["context"]["strata_launch"]["model_id"] = previous
    return candidate, (json.dumps(config, indent=2, ensure_ascii=False) + "\n").encode()


def json_get(url):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(urllib.request.Request(url, headers={"Connection": "close"}), timeout=3) as response:
        return json.loads(response.read(65536))


def protected_states():
    result = {}
    for unit in ("ai-deepseek.service", "ai-agent.service", "netaigis-coding-agent.service"):
        reply = subprocess.run(["systemctl", "show", unit, "--property=ActiveState,SubState,MainPID,InvocationID"],
                               capture_output=True, text=True, timeout=8, check=True)
        result[unit] = dict(line.split("=", 1) for line in reply.stdout.splitlines() if "=" in line)
    return result


def router_has_connections():
    for filename in ("/proc/net/tcp", "/proc/net/tcp6"):
        if any(row.split()[3] in ("01", "03", "08") and int(row.split()[1].split(":")[-1], 16) == 11441
               for row in Path(filename).read_text().splitlines()[1:]):
            return True
    return False


def activate(assets, action, maintenance_confirmed=False, external_copy_verified=False):
    if set(assets) != set(ASSETS) or any(digest(assets[key].encode()) != expected for key, (_, expected) in ASSETS.items()):
        raise ValueError("Public activation assets changed")
    base = {"__name__": "public_maintenance_primitives"}
    exec(compile(assets["maintenance"], "public-maintenance-primitives", "exec"), base)
    base["UNIT"] = UNIT
    if BACKUP.is_symlink() or BACKUP.stat().st_uid != os.geteuid() or BACKUP.stat().st_mode & 0o077:
        raise ValueError("Protected verified backup required")
    manifest_data = base["regular"](BACKUP / "manifest.json", True)
    if digest(manifest_data) != MANIFEST or digest(base["regular"](BACKUP / "artifacts.tar", True)) != ARCHIVE:
        raise ValueError("Verified backup checksums changed")
    manifest = json.loads(manifest_data)
    originals = {}
    for path in (ROUTER, CONFIG, RUNTIME):
        restored = BACKUP / "restore-probe" / path.relative_to("/")
        content = restored.read_bytes()
        if digest(content) != manifest["files"][str(path)]["sha256"]:
            raise ValueError("Verified restored source changed")
        originals[path] = content
    if digest(RUNTIME.read_bytes()) != digest(originals[RUNTIME]):
        raise ValueError("Selected running-model configuration changed")
    candidates = dict(zip((ROUTER, CONFIG), build(originals[ROUTER], originals[CONFIG], originals[RUNTIME], assets["protocol"])))
    plans = []
    for path, candidate in candidates.items():
        current = base["regular"](path)
        if digest(current) not in (digest(originals[path]), digest(candidate)):
            raise ValueError("Unreviewed router change; no overwrite permitted")
        attributes = manifest["files"][str(path)]["attributes"].copy()
        attributes["xattrs"] = {key: base64.b64decode(value) for key, value in attributes["xattrs"].items()}
        if any(base["metadata"](path)[key] != attributes[key] for key in ("uid", "gid", "mode", "xattrs")):
            raise ValueError("Source permissions or ownership changed")
        plans.append({"source": path, "attributes": attributes, "candidate": candidate, "current": digest(current)})
    config = json.loads(candidates[CONFIG])
    target = config["coding"]["url"]
    health = json_get(target + "/health")
    models = json_get(target + "/v1/models")
    if health.get("status") != "ok" or not health.get("loaded") or not any(item.get("id") == config["coding"]["model"] for item in models.get("data", [])):
        raise ValueError("Previously selected model is not confirmed running")
    result = {"action": action, "files": {str(path): digest(data) for path, data in candidates.items()},
              "model": config["coding"]["model"], "observed_model_capacity": health.get("max_context"),
              "context_growth_acceptance_pending": True, "model_request": False}
    if action == "inspect":
        return {"ok": True, **result, "source_modified": False, "service_modified": False}
    if not maintenance_confirmed or not external_copy_verified:
        raise ValueError("Confirmed quiet window and verified external restore are required")
    controller = base["Controller"]()
    controller.quiet(require_running=action == "apply")
    if router_has_connections():
        raise ValueError("Router still has active connections")
    protected = protected_states()
    if any(state.get("ActiveState") != "active" or state.get("SubState") != "running" or int(state.get("MainPID", "0")) < 1 for state in protected.values()):
        raise ValueError("Protected agents or model are not confirmed running")
    configuration = controller.configuration()
    journal = BACKUP / ("router-activation-" + uuid.uuid4().hex + ".jsonl")
    with os.fdopen(os.open(journal, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as log:
        def record(stage):
            log.write(json.dumps({"stage": stage, "at": time.time(), **result}) + "\n")
            log.flush()
            os.fsync(log.fileno())
        record("prepared")
        try:
            controller.stop()
            record("router_stopped")
            for plan in plans:
                if plan["current"] != digest(plan["candidate"]):
                    base["replace_verified"](plan, plan["candidate"], plan["current"])
            record("new_files_installed")
            controller.start()
            deadline = time.monotonic() + 12
            while True:
                try:
                    observed = json_get("http://127.0.0.1:11441/health")
                    if observed.get("status") == "ok":
                        break
                except (OSError, ValueError):
                    pass
                if time.monotonic() >= deadline:
                    raise ValueError("Activated router health not confirmed")
                time.sleep(0.2)
            if protected_states() != protected or controller.configuration() != configuration:
                raise ValueError("Protected service or configuration changed")
            record("verified")
            return {"ok": True, **result, "router": controller.state(), "protected_services_unchanged": True,
                    "source_modified": any(plan["current"] != digest(plan["candidate"]) for plan in plans), "service_modified": True,
                    "journal": str(journal), "functional_model_test_pending": True}
        except Exception as error:
            record("repair_required")
            return {"ok": False, **result, "repair_required": True, **public_failure(error),
                    "router": controller.state(), "journal": str(journal), "new_files_retained": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", choices=("inspect", "apply", "repair"), default="inspect")
    parser.add_argument("--remote", action="store_true")
    parser.add_argument("--maintenance-confirmed", action="store_true")
    parser.add_argument("--external-copy-verified", action="store_true")
    args = parser.parse_args()
    assets = globals().get("ACTIVATION_ASSETS") or load_assets()
    if args.remote:
        import importlib.util
        path = Path(__file__).with_name("netaigis-coding-agent-adapter-remote.py")
        spec = importlib.util.spec_from_file_location("existing_terminal_transport", path)
        transport = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(transport)
        bundle = base64.b64encode(json.dumps({"source": Path(__file__).read_text(), "assets": assets}).encode()).decode()
        argv = ["router-activation", args.action]
        if args.maintenance_confirmed:
            argv.append("--maintenance-confirmed")
        if args.external_copy_verified:
            argv.append("--external-copy-verified")
        program = ("import base64,json,sys; b=json.loads(base64.b64decode(" + repr(bundle) + ")); sys.argv=" + repr(argv)
                   + "; exec(compile(b['source'],'public-router-activation','exec'),{'__name__':'__main__','ACTIVATION_ASSETS':b['assets']})")
        with open("/dev/tty") as terminal:
            return subprocess.call(transport.ssh_command(program), stdin=terminal)
    if os.geteuid() != 0:
        raise SystemExit("Existing root terminal required")
    try:
        result = activate(assets, args.action, args.maintenance_confirmed, args.external_copy_verified)
    except Exception as error:
        result = {"ok": False, "action": args.action, **public_failure(error), "model_request": False}
    print(json.dumps(result))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
