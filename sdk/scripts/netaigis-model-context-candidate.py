"""Pure preparation of the bounded Acer context deployment. No installation.

Actual private inputs stay in the protected verified backups. This module only
returns candidates; it never writes files, starts services or requests a model.
"""
import hashlib
import json
from pathlib import Path

ROUTER = "/opt/ai-model-router/model_router.py"
CONFIG = "/etc/ai-model-router.json"
TRACKER = "/opt/netaigis-coding-agent/context_session.py"
RUNTIME = "/home/friseer/ai-staging/deepseek-v4.1-flash-1017-iq2_xs/deepseek-runtime-32k.json"
TRANSIENT = "/run/systemd/transient/ai-deepseek.service"
MODEL_UNIT = "/etc/systemd/system/ai-deepseek.service"
CONTROLLER = "/opt/ai-model-router/netaigis-model-context.py"
PROFILE = "/opt/ai-model-router/netaigis-model-profile.py"
DROP_IN = "/etc/systemd/system/netaigis-coding-agent.service.d/context-allocation.conf"
PROFILE_ID = "active-model"
DIRECTORY = "ai-deepseek-context"
TIERS = [32768, 65536, 131072, 262144, 524288, 786432, 1000000]
EXPECTED = {
    ROUTER: "948637effe8516d3196b64f332361ed946b245d408c2ca13cbc656f754aeb410",
    CONFIG: "eea634e63e3534875123f9b9f1f32ea54351b125636ed91865857ed0670f04fe",
    TRACKER: "685a355e75d42902700792890eef1a2a4d7df8e8cfa797d5c264fd55e8875aa2",
    RUNTIME: "6280e8607baf4d5e9b6c2474619e7da9c3c370432d36a9bd41d3db03a8b65e1e",
    TRANSIENT: "c5c0832b8cd23e21db85ff149fff01bbb44be0dcb317fd3c8697a4a5d151f2fe",
}
ASSETS = ("netaigis-model-profile.py", "netaigis-model-context.py", "netaigis-model-router-context.py", "netaigis-coding-agent-context-tiers.py")


def digest(value):
    return hashlib.sha256(value).hexdigest()


def public_module(source, name):
    module = {"__name__": "public_context_candidate_" + name}
    exec(compile(source, "public-" + name, "exec"), module)
    return module


def build(inputs, assets, expected=EXPECTED):
    if set(inputs) != set(EXPECTED) or set(assets) != set(ASSETS):
        raise ValueError("Exact reviewed inputs and public assets required")
    if any(digest(inputs[path]) != expected[path] for path in inputs):
        raise ValueError("Reviewed input changed; no deployment candidate produced")
    profiles = public_module(assets["netaigis-model-profile.py"], "profile")
    router = public_module(assets["netaigis-model-router-context.py"], "router")
    tracker = public_module(assets["netaigis-coding-agent-context-tiers.py"], "tracker")
    original = json.loads(inputs[CONFIG])
    identity = profiles["runtime_identity"](inputs[RUNTIME], "--max-context")
    # This activation adopts the already selected model, never a replacement.
    for role in ("coding", "learning"):
        if original[role]["model"] != identity["model"] or original[role]["url"].rstrip("/") != identity["url"]:
            raise ValueError("Configured model route differs from the verified running profile")
    bound = profiles["bind_profile"](inputs[CONFIG], PROFILE_ID, inputs[RUNTIME], RUNTIME, "--max-context",
                                     "ai-deepseek.service", "friseer", ["coding", "learning"], TIERS, TIERS[-1])
    selected = json.loads(bound)
    selected["runtime_profiles"][PROFILE_ID].update({
        "control_socket": "/run/" + DIRECTORY + "/control.sock",
        "serve_argv": profiles["foreground_argv"](inputs[TRANSIENT], RUNTIME, "friseer"),
        "ready_timeout_seconds": 900, "stop_timeout_seconds": 180,
    })
    for role in ("coding", "learning"):
        if any(selected[role][key] != original[role][key] for key in ("model", "url", "provider")):
            raise ValueError("Existing role identity or endpoint changed")
    if selected["embedding"] != original["embedding"]:
        raise ValueError("Embedding route changed")
    result = {
        ROUTER: router["rewrite"](inputs[ROUTER], expected[ROUTER]),
        CONFIG: profiles["encode"](selected),
        TRACKER: tracker["rewrite"](inputs[TRACKER], expected[TRACKER]),
        CONTROLLER: assets["netaigis-model-context.py"],
        PROFILE: assets["netaigis-model-profile.py"],
        MODEL_UNIT: profiles["promote_unit"](inputs[TRANSIENT], expected[TRANSIENT], PROFILE_ID, "friseer", CONTROLLER, DIRECTORY),
        DROP_IN: ("[Service]\nEnvironment=NETAIGIS_CONTEXT_TIERS=" + ",".join(map(str, TIERS)) + "\n").encode(),
    }
    for filename, source in result.items():
        if filename.endswith(".py"):
            compile(source, "reviewed-context-candidate", "exec")
    if RUNTIME in result or TRANSIENT in result:
        raise ValueError("Existing runtime source must remain untouched")
    return result


def read_assets(directory=None):
    directory = Path(directory) if directory else Path(__file__).parent
    return {name: (directory / name).read_bytes() for name in ASSETS}
