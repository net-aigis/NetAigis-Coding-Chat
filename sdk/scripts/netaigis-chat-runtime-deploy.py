"""Prepare, then explicitly activate only the two own local User services.

Preparation writes private staging/restore evidence only. No Acer operations,
model requests, provider settings or global certificate installation.
"""
import argparse
import base64
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import ssl
import stat
import subprocess
import tarfile
import time
import urllib.request

IDENTITY = "netaigis.netaigis-coding-chat"
OPERATOR_HOME = Path.home()
NAMESPACE = OPERATOR_HOME / ".config/Code/User/globalStorage" / IDENTITY
SETTINGS = NAMESPACE / "home/data/settings"
EXTENSION = OPERATOR_HOME / ".vscode/extensions" / (IDENTITY + "-0.1.0")
BUN = OPERATOR_HOME / ".bun/bin/bun"
UNITS = ("netaigis-coding-chat-runtime.service", "netaigis-coding-chat-dashboard.service")
UNIT_DIR = OPERATOR_HOME / ".config/systemd/user"
BACKUP = OPERATOR_HOME / "MyContainer/backups/cline-phase2-20261030T173159+0100/phase6-vscode-preflight-20261101/productive-rollout/shared-runtime-repair-20261102/own-runtime-preflight"
FILES = ("shared-runtime-launch.json", "shared-runtime-actors.json", "shared-runtime-cert.pem", "shared-runtime-key.pem", "shared-runtime-android-invite.txt")
TARGETS = {name: SETTINGS / name for name in FILES} | {name: UNIT_DIR / name for name in UNITS}


class Refused(RuntimeError):
    pass


def digest(value):
    return hashlib.sha256(value).hexdigest()


def private_directory(path):
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or path.resolve() != path or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise Refused("private_existing_directory_required")


def query(unit):
    if unit not in UNITS:
        raise Refused("unit_outside_own_runtime_scope")
    result = subprocess.run(["systemctl", "--user", "--no-pager", "--no-ask-password", "show", unit,
                             "--property=LoadState,ActiveState,SubState,MainPID,FragmentPath"], capture_output=True, text=True, timeout=8)
    fields = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
    if "LoadState" not in fields:
        raise Refused("user_service_manager_unavailable")
    return fields


def control(action, unit=None):
    if (action == "daemon-reload" and unit is None):
        command = ["systemctl", "--user", "daemon-reload"]
    elif action in ("start", "enable") and unit in UNITS:
        command = ["systemctl", "--user", action, unit]
    else:
        raise Refused("only_own_user_service_start_enable_allowed")
    subprocess.run(command, capture_output=True, timeout=35, check=True)


def unit_text(mode, config):
    if mode not in ("daemon", "dashboard"):
        raise Refused("invalid_service_role")
    dependency = "Requires=" + UNITS[0] + "\nAfter=" + UNITS[0] + "\n" if mode == "dashboard" else "After=network.target\n"
    return ("[Unit]\nDescription=NetAigis Coding Chat " + mode + "\n" + dependency +
            "StartLimitIntervalSec=60\nStartLimitBurst=6\n\n[Service]\nType=exec\nUMask=0077\n" +
            "WorkingDirectory=" + str(OPERATOR_HOME / "MyGIT") + "\nExecStart=" + str(BUN) + " --no-env-file " +
            str(EXTENSION / "dist/shared-runtime/netaigis-runtime.mjs") + " " + mode + " " + str(config) +
            "\nRestart=on-failure\nRestartSec=5\nTimeoutStopSec=30\n\n[Install]\nWantedBy=default.target\n")


def payload_check():
    metadata = json.loads((EXTENSION / "package.json").read_text())
    if metadata.get("publisher") + "." + metadata.get("name") != IDENTITY or metadata.get("version") != "0.1.0":
        raise Refused("own_installed_identity_not_confirmed")
    private_directory(NAMESPACE)
    private_directory(SETTINGS)
    if not BUN.is_file():
        raise Refused("existing_bun_runtime_unavailable")
    return digest((EXTENSION / "dist/shared-runtime/netaigis-runtime.mjs").read_bytes())


def absent_targets():
    if any(os.path.lexists(path) for path in TARGETS.values()):
        raise Refused("deployment_target_already_exists_preserve_it")
    if any(query(unit)["LoadState"] != "not-found" for unit in UNITS):
        raise Refused("own_service_name_already_loaded")


def free_ports(host):
    for address, port in (("127.0.0.1", 25463), (host, 8787)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind((address, port))


def sqlite_file(path):
    with path.open("rb") as stream:
        return stream.read(16) == b"SQLite format 3\0"


def sources():
    files = []
    for path in sorted(NAMESPACE.rglob("*")):
        if path.is_symlink():
            raise Refused("own_data_symlink_requires_review")
        if path.is_dir():
            continue
        if not path.is_file():
            raise Refused("own_data_special_file_requires_review")
        if str(path).endswith(("-wal", "-shm")):
            parent = Path(str(path)[:-4])
            if parent.is_file() and sqlite_file(parent):
                continue
        files.append(path)
    return files


def logical_hash(path, immutable=False):
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro" + ("&immutable=1" if immutable else ""), uri=True)) as db:
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise Refused("own_sqlite_integrity_failed")
        return digest("\n".join(db.iterdump()).encode())


def fingerprint():
    return {str(path.relative_to(NAMESPACE)): logical_hash(path) if sqlite_file(path) else digest(path.read_bytes()) for path in sources()}


def snapshot_own_data():
    private_directory(BACKUP.parent)
    before = fingerprint()
    os.umask(0o077)
    BACKUP.mkdir(mode=0o700, exist_ok=False)
    data = BACKUP / "snapshot"
    data.mkdir(mode=0o700)
    attributes = {}
    for path in sources():
        relative = path.relative_to(NAMESPACE)
        target = data / relative
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = path.stat()
        attributes[str(relative)] = {"uid": info.st_uid, "gid": info.st_gid, "mode": stat.S_IMODE(info.st_mode), "mtime_ns": info.st_mtime_ns, "xattrs": {name: base64.b64encode(os.getxattr(path, name)).decode() for name in os.listxattr(path)}}
        if sqlite_file(path):
            with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as reader, closing(sqlite3.connect(target)) as writer:
                reader.backup(writer)
                if writer.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                    raise Refused("own_backup_integrity_failed")
        else:
            shutil.copy2(path, target)
        target.chmod(0o600)
    if before != fingerprint():
        raise Refused("own_data_changed_during_snapshot_keep_incomplete_evidence")
    archive = BACKUP / "own-data.tar"
    with tarfile.open(archive, "x", format=tarfile.PAX_FORMAT) as writer:
        writer.add(data, arcname="snapshot")
    restore = BACKUP / "restore-probe"
    restore.mkdir(mode=0o700)
    with tarfile.open(archive) as reader:
        if any(not (m.isfile() or m.isdir()) or Path(m.name).is_absolute() or ".." in Path(m.name).parts for m in reader):
            raise Refused("backup_archive_members_invalid")
        reader.extractall(restore, filter="data")
    for source in data.rglob("*"):
        if not source.is_file():
            continue
        relative = source.relative_to(data)
        recovered = restore / "snapshot" / relative
        if digest(source.read_bytes()) != digest(recovered.read_bytes()):
            raise Refused("actual_restore_content_failed")
        if sqlite_file(recovered) and logical_hash(source, immutable=True) != logical_hash(recovered, immutable=True):
            raise Refused("actual_restore_sqlite_failed")
        metadata = attributes[str(relative)]
        os.chown(recovered, metadata["uid"], metadata["gid"])
        recovered.chmod(metadata["mode"])
        os.utime(recovered, ns=(metadata["mtime_ns"], metadata["mtime_ns"]))
        for name, value in metadata["xattrs"].items():
            os.setxattr(recovered, name, base64.b64decode(value))
        info = recovered.stat()
        actual = {"uid": info.st_uid, "gid": info.st_gid, "mode": stat.S_IMODE(info.st_mode), "mtime_ns": info.st_mtime_ns,
                  "xattrs": {name: base64.b64encode(os.getxattr(recovered, name)).decode() for name in os.listxattr(recovered)}}
        if actual != metadata:
            raise Refused("actual_restore_attributes_failed")
    record = {"archive_sha256": digest(archive.read_bytes()), "file_count": len(before), "source_fingerprint": before,
              "attributes": attributes, "actual_restore_verified": True, "productive_files_modified": False}
    (BACKUP / "manifest.json").write_text(json.dumps(record, indent=2))
    return digest((BACKUP / "manifest.json").read_bytes())


def prepare(stage, host):
    private_directory(stage)
    if any(stage.iterdir()):
        raise Refused("empty_private_stage_required_existing_evidence_retained")
    payload = payload_check()
    absent_targets()
    free_ports(host)
    # Validate before choosing a certificate identity; no DNS assumptions or wildcard bind.
    if not host.startswith("192.168.") or len(host.split(".")) != 4:
        raise Refused("explicit_existing_lan_ipv4_required")
    backup = snapshot_own_data()
    os.umask(0o077)
    actors = {actor: os.urandom(32).hex() for actor in ("Friseer", "jimmi")}
    invite = os.urandom(32).hex()
    (stage / FILES[1]).write_text(json.dumps(actors))
    command = ["openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-sha256", "-days", "365", "-nodes",
               "-keyout", str(stage / FILES[3]), "-out", str(stage / FILES[2]), "-subj", "/CN=NetAigis Coding Chat",
               "-addext", "subjectAltName=IP:" + host + ",IP:127.0.0.1,DNS:localhost"]
    subprocess.run(command, capture_output=True, check=True, timeout=15)
    config = {"version": 1, "storageRoot": str(NAMESPACE / "home"), "workspaceRoot": str(OPERATOR_HOME / "MyGIT"),
              "actorTokensFile": str(TARGETS[FILES[1]]), "hubPort": 25463,
              "dashboard": {"host": host, "port": 8787, "publicUrl": "https://" + host + ":8787", "roomSecret": invite,
                            "certFile": str(TARGETS[FILES[2]]), "keyFile": str(TARGETS[FILES[3]])}}
    (stage / FILES[0]).write_text(json.dumps(config, indent=2))
    (stage / FILES[4]).write_text(config["dashboard"]["publicUrl"] + "/chat?roomSecret=" + invite + "\n")
    for mode, unit in zip(("daemon", "dashboard"), UNITS):
        (stage / unit).write_text(unit_text(mode, TARGETS[FILES[0]]))
    for name in TARGETS:
        (stage / name).chmod(0o600)
    record = {"version": 1, "host": host, "installed_payload_sha256": payload, "own_backup_manifest_sha256": backup,
              "files": {name: {"target": str(target), "sha256": digest((stage / name).read_bytes())} for name, target in TARGETS.items()},
              "services_started": False, "credentials_output": False}
    with (stage / "manifest.json").open("x") as writer:
        json.dump(record, writer, indent=2)
    print(json.dumps({"ok": True, "action": "prepare", "stage": str(stage), "backup": str(BACKUP), "file_count": len(TARGETS),
                      "manifest_sha256": digest((stage / "manifest.json").read_bytes()), "actual_own_restore_verified": True,
                      "public_url": config["dashboard"]["publicUrl"], "services_started": False, "credentials_output": False}))


def validate_stage(stage):
    private_directory(stage)
    record = json.loads((stage / "manifest.json").read_text())
    if record.get("version") != 1 or set(record.get("files", {})) != set(TARGETS):
        raise Refused("deployment_manifest_scope_changed")
    for name, target in TARGETS.items():
        info = (stage / name).lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise Refused("prepared_file_protection_changed")
        if record["files"][name] != {"target": str(target), "sha256": digest((stage / name).read_bytes())}:
            raise Refused("prepared_file_or_target_changed")
    if record["installed_payload_sha256"] != payload_check() or record["own_backup_manifest_sha256"] != digest((BACKUP / "manifest.json").read_bytes()):
        raise Refused("installed_payload_or_backup_changed")
    backup = json.loads((BACKUP / "manifest.json").read_text())
    if not backup["actual_restore_verified"] or backup["source_fingerprint"] != fingerprint():
        raise Refused("own_data_changed_since_preflight_current_delta_required")
    return record


def publish(source, target):
    # Every target was absent and is created exclusively. Never chmod/replace existing files.
    parent = target.parent
    existing = parent
    missing = []
    while not os.path.lexists(existing):
        missing.append(existing)
        existing = existing.parent
    info = existing.lstat()
    if not stat.S_ISDIR(info.st_mode) or existing.resolve() != existing or info.st_uid != os.getuid() or info.st_mode & 0o022:
        raise Refused("deployment_ancestor_changed")
    for directory in reversed(missing):
        directory.mkdir(mode=0o700, exist_ok=False)
    info = parent.lstat()
    if not stat.S_ISDIR(info.st_mode) or parent.resolve() != parent or info.st_uid != os.getuid() or info.st_mode & 0o022:
        raise Refused("deployment_parent_changed")
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as writer:
        writer.write(source.read_bytes()); writer.flush(); os.fsync(writer.fileno())


def wait_health(url, context=None):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context))
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            with opener.open(url, timeout=2) as response:
                if response.status == 200:
                    return json.loads(response.read(1048576))
        except (OSError, ValueError):
            pass
        time.sleep(0.25)  # Bounded startup readiness, no tool execution/replay.
    raise Refused("new_service_http_readiness_not_confirmed")


def apply(stage, approved):
    if not approved:
        raise Refused("explicit_new_local_services_approval_required")
    record = validate_stage(stage)
    absent_targets(); free_ports(record["host"])
    for name, target in TARGETS.items():
        publish(stage / name, target)
    control("daemon-reload")
    control("start", UNITS[0])
    health = wait_health("http://127.0.0.1:25463/health")
    discovery = json.loads((NAMESPACE / "home/data/locks/hub/production.json").read_text())
    if (discovery.get("hubId") != health.get("hubId") or
            str(discovery.get("pid")) != query(UNITS[0]).get("MainPID")):
        raise Refused("own_runtime_process_identity_not_confirmed")
    control("start", UNITS[1])
    browser = wait_health("https://" + record["host"] + ":8787/health", ssl.create_default_context(cafile=str(TARGETS[FILES[2]])))
    if not browser.get("connected") or not browser.get("healthy") or browser.get("address") != "ws://127.0.0.1:25463/hub":
        raise Refused("dashboard_canonical_runtime_not_confirmed")
    for unit in UNITS:
        if query(unit).get("ActiveState") != "active":
            raise Refused("new_user_service_not_active")
        control("enable", unit)
    report = {"ok": True, "action": "apply", "units": {unit: query(unit) for unit in UNITS}, "acer_modified": False, "model_request": False,
              "private_credentials_created": True, "system_trust_modified": False, "client_connection_not_automatically_changed": True}
    with (stage / "application.json").open("x") as writer:
        json.dump(report, writer, indent=2)
    print(json.dumps(report))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "apply"))
    parser.add_argument("--stage", type=Path, required=True)
    parser.add_argument("--host")
    parser.add_argument("--new-local-services-approved", action="store_true")
    args = parser.parse_args()
    try:
        if args.action == "prepare": prepare(args.stage.resolve(), args.host or "")
        else: apply(args.stage.resolve(), args.new_local_services_approved)
    except Exception as error:
        reason = str(error) if isinstance(error, Refused) else type(error).__name__
        print(json.dumps({"ok": False, "action": args.action, "reason": reason, "repair_required": args.action == "apply",
                          "automatic_rollback": False, "credentials_output": False}))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
