"""Pure model-profile/context transformations for the existing Acer infrastructure.

No model names, model downloads, service calls, file writes or default selection.
The caller explicitly chooses the existing runtime, service, user and bound roles.
"""
import copy
import hashlib
import json
import re
import shlex
from urllib.parse import urlsplit


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def runtime_identity(source, context_argument):
    runtime = json.loads(source)
    if not isinstance(runtime, dict) or not re.fullmatch(r"--?[A-Za-z][A-Za-z0-9_-]*", context_argument):
        raise ValueError("Invalid runtime profile or context argument")
    args = runtime.get("args")
    if not isinstance(args, list) or not all(isinstance(value, str) for value in args) or args.count(context_argument) != 1:
        raise ValueError("Runtime must declare exactly one context argument")
    index = args.index(context_argument) + 1
    if index >= len(args) or not args[index].isascii() or not args[index].isdecimal() or int(args[index]) < 1:
        raise ValueError("Runtime context must be a positive integer")
    model, host, port = runtime.get("model_name"), runtime.get("host"), runtime.get("port")
    if not isinstance(model, str) or not model or host not in ("127.0.0.1", "::1", "localhost") or type(port) is not int or not 1 <= port <= 65535:
        raise ValueError("Runtime needs an explicit model and loopback listener")
    normalized = copy.deepcopy(runtime)
    normalized["args"][index] = "$NETAIGIS_CONTEXT"
    signature = hashlib.sha256(json.dumps(normalized, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    url = "http://" + ("[" + host + "]" if host == "::1" else host) + ":" + str(port)
    return {"model": model, "url": url, "context": int(args[index]), "context_index": index,
            "signature": signature}


def render_context(source, context_argument, required, expected_signature):
    if type(required) is not int or required < 1:
        raise ValueError("Requested context must be a positive integer")
    identity = runtime_identity(source, context_argument)
    if identity["signature"] != expected_signature:
        raise ValueError("Selected runtime changed outside its context allocation")
    runtime = json.loads(source)
    runtime["args"][identity["context_index"]] = str(required)
    return encode(runtime)


def validate_policy(tiers, maximum):
    if not isinstance(tiers, list) or not tiers or any(type(value) is not int or value < 1 for value in tiers):
        raise ValueError("Context tiers must be positive integers")
    if tiers != sorted(set(tiers)) or type(maximum) is not int or tiers[-1] != maximum:
        raise ValueError("Context tiers and declared maximum must agree")


def bind_profile(config_source, profile_id, runtime_source, runtime_path, context_argument, unit, user, roles, tiers, maximum):
    """Bind explicitly selected roles atomically in one configuration document."""
    validate_policy(tiers, maximum)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", profile_id) or not re.fullmatch(r"[A-Za-z0-9@._-]+\.service", unit):
        raise ValueError("Explicit profile and service identifiers required")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", user) or user == "root" or not runtime_path.startswith("/"):
        raise ValueError("A non-root runtime user and absolute runtime config are required")
    if not roles or len(set(roles)) != len(roles) or any(role not in ("coding", "learning") for role in roles):
        raise ValueError("Bound agent roles must be explicit and unique")
    identity = runtime_identity(runtime_source, context_argument)
    config = json.loads(config_source)
    for role in roles:
        if not isinstance(config.get(role), dict) or config[role].get("provider") != "strata":
            raise ValueError("Selected role is not an existing Strata route")
    config.setdefault("runtime_profiles", {})[profile_id] = {
        "runtime_config": runtime_path, "context_argument": context_argument,
        "signature": identity["signature"], "unit": unit, "user": user,
    }
    for role in roles:
        config[role].update(url=identity["url"], model=identity["model"], runtime_profile=profile_id)
        config[role].setdefault("context", {}).update(tiers=list(tiers), documented_max=maximum)
    return encode(config)


def selected_profile(config, role):
    route = config[role]
    profile = config["runtime_profiles"][route["runtime_profile"]]
    validate_policy(route["context"]["tiers"], route["context"]["documented_max"])
    url = urlsplit(route["url"])
    if url.scheme != "http" or url.hostname not in ("127.0.0.1", "::1", "localhost") or url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
        raise ValueError("Selected backend must be explicit loopback")
    if profile["user"] == "root":
        raise ValueError("Automatic process control requires an unprivileged model process")
    return profile


def foreground_argv(unit_source, runtime_path, user):
    """Preserve the actual virtualenv/flags; remove only an exact same-user wrapper."""
    commands = [line.split("=", 1)[1].strip() for line in unit_source.decode().splitlines()
                if line.startswith("ExecStart=") and line.split("=", 1)[1].strip()]
    if len(commands) != 1 or "$" in commands[0] or "%" in commands[0] or "\\" in commands[0]:
        raise ValueError("Explicit single foreground model command required")
    command = shlex.split(commands[0])
    if command[0] in ("/sbin/runuser", "/usr/sbin/runuser"):
        if command[1:4] != ["-u", user, "--"]:
            raise ValueError("Existing model user differs from selected profile")
        command = command[4:]
    if not command or not command[0].startswith("/") or command.count("--config") != 1 or command.count(runtime_path) != 1:
        raise ValueError("Explicit existing runtime launcher required")
    index = command.index("--config") + 1
    if index >= len(command) or command[index] != runtime_path or command.count("--engine") != 1:
        raise ValueError("Existing runtime profile argument differs")
    engine = command.index("--engine") + 1
    if engine >= len(command) or command[engine] != "strata":
        raise ValueError("Existing real model engine required")
    command[index] = "{runtime_config}"
    if "--shutdown-timeout" not in command:
        command.extend(["--shutdown-timeout", "180"])
    return command


def promote_unit(source, expected_sha256, profile_id, user, installed_helper, runtime_directory):
    """Preserve the original definition; prepare explicit service overrides only."""
    if hashlib.sha256(source).hexdigest() != expected_sha256:
        raise ValueError("Model unit changed; no candidate produced")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", profile_id) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", user) or user == "root":
        raise ValueError("Explicit profile and unprivileged user required")
    if not re.fullmatch(r"/[A-Za-z0-9_./-]+", installed_helper):
        raise ValueError("Installed helper must have an explicit safe path")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", runtime_directory):
        raise ValueError("An explicit private systemd runtime directory is required")
    override = ("\n[Unit]\nCollectMode=inactive\n[Service]\nUser=" + user
                + "\nExecStart=\nExecStart=/usr/bin/python3 -I " + installed_helper + " --serve --profile " + profile_id
                + "\nRuntimeDirectory=" + runtime_directory + "\nRuntimeDirectoryMode=0700\nRuntimeDirectoryPreserve=no"
                + "\nKillMode=control-group\nRestart=on-failure\nRestartSec=3\nTimeoutStartSec=900\nTimeoutStopSec=210\n")
    return source.rstrip(b"\n") + b"\n" + override.encode()
