"""Byte-pinned context repair for the existing private router, never its deployment.

Keep private sources on Acer. Replace only observed context functions/anchors;
the existing inference lock, streaming, session persistence and routes survive.
"""
import ast
import hashlib

SOURCE_SHA256 = "948637effe8516d3196b64f332361ed946b245d408c2ca13cbc656f754aeb410"

HELPERS = '''
def _netaigis_context_request(scope, required=None):
    import socket
    import stat
    import struct
    route = CONFIG[scope]
    profile = CONFIG.get("runtime_profiles", {}).get(route.get("runtime_profile"))
    if not isinstance(profile, dict):
        raise RuntimeError("context_profile_not_configured")
    address = profile.get("control_socket")
    if not isinstance(address, str) or not address.startswith("/"):
        raise RuntimeError("invalid_context_control_address")
    info = os.lstat(address)
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError("context_control_not_private")
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(3 if required is None else 2 * profile.get("ready_timeout_seconds", 900) + 2 * profile.get("stop_timeout_seconds", 180) + 10)
        client.connect(address)
        _pid, uid, _gid = struct.unpack("3i", client.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
        if uid != os.getuid():
            raise RuntimeError("context_control_owner_mismatch")
        request = {"op": "observe"} if required is None else {"op": "ensure_context", "role": scope, "required": required}
        client.sendall((json.dumps(request) + "\\n").encode())
        with client.makefile("rb") as stream:
            raw = stream.readline(65537)
        if len(raw) > 65536 or not raw.endswith(b"\\n"):
            raise RuntimeError("invalid_context_control_response")
    response = json.loads(raw)
    if not isinstance(response, dict) or response.get("ok") is not True:
        raise RuntimeError("context_allocation_not_confirmed")
    if response.get("state") != "ready" or response.get("model") != route["model"]:
        raise RuntimeError("selected_context_runtime_not_ready")
    capacity = response.get("current_context")
    if type(capacity) is not int or capacity < 1 or (required is not None and capacity < required):
        raise RuntimeError("context_capacity_not_confirmed")
    return response


def _netaigis_context_policy(scope):
    route = CONFIG[scope]
    policy = route["context"]
    tiers = policy["tiers"]
    maximum = policy["documented_max"]
    if (not isinstance(tiers, list) or not tiers or any(type(n) is not int or n < 1 for n in tiers)
            or tiers != sorted(set(tiers)) or type(maximum) is not int or tiers[-1] != maximum):
        raise ValueError("invalid_context_tier_policy")
    return tiers, maximum


def _netaigis_selected_tier(required, scope):
    tiers, _maximum = _netaigis_context_policy(scope)
    return next((tier for tier in tiers if tier >= required), None)


def _netaigis_context_metadata(scope):
    # Configured request limit is not a claim of a successfully allocated maximum.
    tiers, maximum = _netaigis_context_policy(scope)
    try:
        actual = _netaigis_context_request(scope)
        return {"version": 1, "state": "ready", "allocation": "on_demand",
                "loaded_capacity": actual["current_context"], "request_limit": maximum, "tiers": tiers}
    except (OSError, ValueError, RuntimeError):
        return {"version": 1, "state": "unknown", "allocation": "unavailable"}
'''.lstrip()

CAPACITY = '''
def context_capacity(scope="coding"):
    route = CONFIG[scope]
    health = fetch_json(route["url"], "/health", timeout=10)
    capacity = health.get("max_context")
    if health.get("loaded") is not True or health.get("status") != "ok" or type(capacity) is not int or capacity < 1:
        raise RuntimeError("selected_model_context_unknown")
    models = fetch_json(route["url"], "/v1/models", timeout=10)
    if not any(isinstance(item, dict) and item.get("id") == route["model"] for item in models.get("data", [])):
        raise RuntimeError("selected_model_not_confirmed")
    return capacity
'''.lstrip()

INCREASE = '''
def increase_context(required, scope="coding"):
    if type(required) is not int or required < 1:
        raise ValueError("invalid_context_request")
    _tiers, maximum = _netaigis_context_policy(scope)
    if required > maximum:
        raise OverflowError("configured_context_maximum_exceeded")
    return _netaigis_context_request(scope, required)["current_context"]
'''.lstrip()


def rewrite(source, expected_sha256=SOURCE_SHA256):
    if hashlib.sha256(source).hexdigest() != expected_sha256:
        raise ValueError("Router source changed; no context candidate produced")
    tree = ast.parse(source)
    if any(isinstance(n, ast.FunctionDef) and n.name.startswith("_netaigis_context_") for n in ast.walk(tree)):
        raise ValueError("Router context correction already present")
    lines = source.splitlines(keepends=True)

    def offset(node, end=False):
        row, column = (node.end_lineno, node.end_col_offset) if end else (node.lineno, node.col_offset)
        # AST columns are UTF-8 byte offsets, as are these source buffers.
        return sum(map(len, lines[:row - 1])) + column

    def unique(nodes):
        if len(nodes) != 1:
            raise ValueError("Router context anchor changed")
        return nodes[0]

    def function(name):
        return unique([n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == name])

    capacity, increase, native, get = [function(name) for name in ("context_capacity", "increase_context", "do_ollama_chat", "do_GET")]
    edits = [(offset(capacity), offset(capacity, True), CAPACITY.rstrip().encode()),
             (offset(increase), offset(increase, True), INCREASE.rstrip().encode()),
             (offset(capacity), offset(capacity), HELPERS.encode() + b"\n\n")]

    def substitute(node, expression):
        edits.append((offset(node), offset(node, True), expression.encode()))

    for variable, value in (("requested", 'opts.get("num_ctx", CONFIG[scope]["context"]["tiers"][0])'),
                            ("scope_max", '_netaigis_context_policy(scope)[1]')):
        node = unique([n for n in ast.walk(native) if isinstance(n, ast.Assign) and len(n.targets) == 1
                       and isinstance(n.targets[0], ast.Name) and n.targets[0].id == variable])
        substitute(node.value, value)
    bound = unique([n for n in ast.walk(native) if isinstance(n, ast.If) and ast.unparse(n.test) == "requested < 32768 or requested > scope_max"])
    substitute(bound.test, "type(requested) is not int or requested < 1 or requested > scope_max")
    tier = unique([n for n in ast.walk(native) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "selected_tier"])
    substitute(tier, "_netaigis_selected_tier(" + ast.unparse(tier.args[0]) + ", scope)")
    launch = unique([n for n in ast.walk(native) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "increase_context"])
    substitute(launch, "increase_context(tier, scope)")
    model = unique([n for n in ast.walk(get) if isinstance(n, ast.Dict) and ast.literal_eval(n.keys[0]) == "id"
                    and any(isinstance(value, ast.Constant) and value.value == "model" for value in n.values)])
    substitute(model, '{"id": model, "object": "model", "netaigis_context": _netaigis_context_metadata("coding")}')
    main = function("main")
    minimum = unique([n for n in ast.walk(main) if isinstance(n, ast.If) and ast.unparse(n.test) == "_TIERS[0] != 32768 or tuple(sorted(set(_TIERS))) != _TIERS"])
    substitute(minimum.test, 'not _TIERS or any(type(n) is not int or n < 1 for n in _TIERS) or tuple(sorted(set(_TIERS))) != _TIERS')
    candidate = source
    # At equal starts replace a function first, then prepend its helpers.
    for start, end, replacement in sorted(edits, key=lambda item: (item[0], item[1]), reverse=True):
        candidate = candidate[:start] + replacement + candidate[end:]
    compile(candidate, "verified-router-context-candidate", "exec")
    return candidate
