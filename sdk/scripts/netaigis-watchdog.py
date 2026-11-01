#!/usr/bin/python3
"""Independent, read-only Acer infrastructure probe. No Cline/agent imports or control actions.

Run once from the separate systemd timer. Reports observations, never restarts
monitored services, executes model turns, rewrites configurations or reads secrets.
"""
import argparse
import datetime
import json
import re
import subprocess
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from pathlib import Path

PROPERTIES = (
    "Id", "LoadState", "ActiveState", "SubState", "Result", "MainPID",
    "ExecMainCode", "ExecMainStatus", "InvocationID", "NRestarts",
)


def read_unit(unit, timeout):
    if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.@:-]*\.service", unit):
        raise ValueError("invalid_unit")
    result = subprocess.run(
        ["/usr/bin/systemctl", "--no-pager", "--no-ask-password", "show",
         "--property=" + ",".join(PROPERTIES), "--", unit],
        capture_output=True, text=True, timeout=timeout, check=False,
    )
    if result.returncode:
        raise RuntimeError("unit_query_failed")
    data = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
    if not all(key in data for key in PROPERTIES):
        raise ValueError("unit_query_incomplete")
    return {key: data[key] for key in PROPERTIES}


def read_process_identity(pid):
    if not isinstance(pid, int) or pid <= 0:
        raise ValueError("main_process_missing")
    # comm may contain spaces/parentheses; parse after its last closing parenthesis.
    raw = Path(f"/proc/{pid}/stat").read_text()
    fields = raw[raw.rindex(")") + 2:].split()
    if len(fields) < 20 or fields[0] in ("Z", "X", "x"):
        raise ValueError("main_process_not_live")
    return {"pid": pid, "start_ticks": int(fields[19])}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


def validate_health_url(url):
    parsed = urlsplit(url)
    if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "::1", "localhost") or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("health_endpoint_must_be_explicit_loopback")


def parse_target(value):
    unit, separator, url = value.partition("=")
    try:
        if not separator or not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.@:-]*\.service", unit):
            raise ValueError("invalid_unit")
        validate_health_url(url)
    except ValueError:
        raise argparse.ArgumentTypeError("target must be a service and credential-free loopback health URL") from None
    return unit, url


def read_health(url, timeout):
    # Existing Acer endpoints only; do not forward credentials or use ambient proxies.
    validate_health_url(url)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    started = time.monotonic()
    try:
        with opener.open(url, timeout=timeout) as response:
            raw = response.read(65537)
            if len(raw) > 65536:
                raise ValueError("health_response_too_large")
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ValueError("health_response_invalid")
            valid = data.get("status") == "ok" if "status" in data else data.get("ok") is True
            # Never return arbitrary response fields: health endpoints may expose configuration.
            return {"http_status": response.status, "healthy": response.status == 200 and valid,
                    "duration_ms": round((time.monotonic() - started) * 1000, 2)}
    except urllib.error.HTTPError as error:
        return {"http_status": error.code, "healthy": False,
                "duration_ms": round((time.monotonic() - started) * 1000, 2)}


def check_target(unit, health_url, timeout=3):
    started = time.monotonic()
    observation = {"unit": unit, "scope": "unit_process_and_health", "state": "unknown", "findings": []}
    try:
        before = read_unit(unit, timeout)
        observation["service"] = before
        if before["LoadState"] != "loaded" or before["ActiveState"] != "active" or before["SubState"] != "running":
            observation.update(state="unhealthy", findings=["service_not_running"])
            return observation
        identity = read_process_identity(int(before["MainPID"]))
        observation["process"] = identity
        health = read_health(health_url, timeout)
        observation["health"] = health
        after = read_unit(unit, timeout)
        if before["InvocationID"] != after["InvocationID"] or before["MainPID"] != after["MainPID"] or identity != read_process_identity(int(after["MainPID"])):
            observation["findings"].append("process_changed_during_probe")
            return observation
        if after["ActiveState"] != "active" or after["SubState"] != "running":
            observation.update(state="unhealthy", findings=["service_stopped_during_probe"])
        elif not health["healthy"]:
            observation.update(state="unhealthy", findings=["health_failed"])
        elif after["Result"] != "success":
            observation.update(state="unhealthy", findings=["unit_reports_failure"])
        else:
            observation["state"] = "healthy"
        return observation
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired):
        # Do not log exception strings, unit output, credentials or arbitrary health bodies.
        observation["findings"].append("observation_failed")
        return observation
    finally:
        observation["duration_ms"] = round((time.monotonic() - started) * 1000, 2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="one bounded observation; scheduling belongs to systemd")
    parser.add_argument("--timeout", type=float, default=3)
    parser.add_argument("--target", action="append", type=parse_target,
                        help="explicit UNIT=http://127.0.0.1:PORT/health; repeat for each existing service")
    options = parser.parse_args()
    if not 0 < options.timeout <= 5:
        parser.error("timeout must be between 0 and 5 seconds")
    targets = options.target or [
        ("netaigis-coding-agent.service", "http://127.0.0.1:11436/health"),
        ("ai-agent.service", "http://127.0.0.1:11435/health"),
    ]
    if len(targets) > 8 or len({unit for unit, _url in targets}) != len(targets):
        parser.error("use one to eight distinct existing service targets")
    observations = [check_target(unit, url, options.timeout) for unit, url in targets]
    print(json.dumps({"version": 1, "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                      "component": "netaigis-watchdog", "observations": observations}, separators=(",", ":")))
    return 0 if all(item["state"] == "healthy" for item in observations) else 1


if __name__ == "__main__":
    raise SystemExit(main())
