"""Back up the explicitly selected newly affected Acer files and actually restore them.

Only backup/export artifacts are written, under the existing protected Phase-2
locations. No source permissions, configurations, services or models are changed.
This does not authorize productive router/model-context application.
The Recall-project delta adds only its two reviewed existing modules.
"""
import argparse
import ast
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess

PARENT = Path("/root/netaigis-recall-backups/phase2-20261030T165000Z")
EXPORT = Path("/home/friseer/recall-phase2-export-20261030T165000Z")
NAME = "phase4-model-context-preflight"
DELTA_NAME = "phase4-dynamic-context-delta"
CODING_PREFIX_NAME = "phase4-coding-prefix-cache-delta"
CODING_PREFIX_FILES = {
    "/opt/netaigis-coding-agent/app.py": "ca9817079d3081eff10b4020cd44b298259963321522d449eb77c0d4073d6201",
}
RECALL_PROJECTS_NAME = "phase4-recall-projects-delta"
RECALL_PROJECTS_FILES = {
    "/opt/netaigis-coding-agent/recall_api.py": "76c17214d28422026ff98a461d44884d9330624765d6e878e16cccda2c070d3b",  # gitleaks:allow -- Public source SHA256, not a credential.
    "/opt/netaigis-coding-agent/recall_store.py": "7885856b549d4b6b5cb3af51e6f27b95233db108a0e858c74486354085de960b",
}
DELTA_FILES = {
    "/opt/ai-model-router/model_router.py": "948637effe8516d3196b64f332361ed946b245d408c2ca13cbc656f754aeb410",
    "/etc/ai-model-router.json": "eea634e63e3534875123f9b9f1f32ea54351b125636ed91865857ed0670f04fe",
}
FILES = {
    "/opt/ai-model-router/model_router.py": "20a5c578fcbeb00afa3b2a92d930582c238e738526c8ffc20b098f67a2410e0c",
    "/etc/ai-model-router.json": "1d354e9e42e277a8c3db3039b9ed83d327b90d33d1d5a533965e65af5cb9c121",
    "/opt/netaigis-coding-agent/context_session.py": "685a355e75d42902700792890eef1a2a4d7df8e8cfa797d5c264fd55e8875aa2",
    "/opt/netaigis-coding-agent/ollama_adapter.py": "307497023baea81eabda77d96045c81fecc605a296748dc0ad163f7e01c4ffd9",
    "/home/friseer/ai-staging/deepseek-v4.1-flash-1017-iq2_xs/deepseek-runtime-32k.json": "6280e8607baf4d5e9b6c2474619e7da9c3c370432d36a9bd41d3db03a8b65e1e",
    "/run/systemd/transient/ai-deepseek.service": None,
    "/etc/systemd/system/ai-model-router.service": None,
}


class Refused(ValueError):
    def __init__(self, code, source=None):
        super().__init__(code)
        self.code = code
        self.source = source


def digest(data):
    return hashlib.sha256(data).hexdigest()


def attributes(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise Refused("source_not_a_regular_file", str(path))
    return {"uid": info.st_uid, "gid": info.st_gid, "mode": stat.S_IMODE(info.st_mode),
            "mtime_ns": info.st_mtime_ns,
            "xattrs": {name: base64.b64encode(os.getxattr(path, name)).decode() for name in sorted(os.listxattr(path))}}


def protected_parent(path, owner):
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != owner or info.st_mode & 0o077:
        raise Refused("existing_backup_or_export_parent_not_protected", str(path))


def write_private(path, data):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as target:
        target.write(data)
        target.flush()
        os.fsync(target.fileno())


def prepare(files, parent, export_parent, export_uid, export_gid, state, run=subprocess.run, *, name=NAME):
    if name not in (NAME, DELTA_NAME, RECALL_PROJECTS_NAME, CODING_PREFIX_NAME):
        raise Refused("unknown_incremental_backup_name")
    if name == RECALL_PROJECTS_NAME and files != RECALL_PROJECTS_FILES:
        raise Refused("recall_project_backup_scope_changed")
    protected_parent(parent, os.geteuid())
    protected_parent(export_parent, export_uid)
    before_state = state()
    records = {}
    for filename, expected in files.items():
        source = Path(filename)
        if not source.is_absolute() or source.resolve() != source:
            raise Refused("source_path_is_not_explicit_and_canonical", filename)
        meta = attributes(source)
        content = source.read_bytes()
        actual = digest(content)
        if expected is not None and actual != expected:
            raise Refused("source_hash_changed_before_backup", filename)
        records[filename] = {"sha256": actual, "attributes": meta}
    root = parent / name
    root.mkdir(mode=0o700)
    archive = root / "artifacts.tar"
    relative = [str(Path(filename).relative_to("/")) for filename in files]
    run(["tar", "--format=pax", "--xattrs", "--xattrs-include=*", "--acls", "--numeric-owner", "--atime-preserve=system",
         "-cpf", str(archive), "--", *relative], cwd="/", check=True, capture_output=True)
    archive.chmod(0o600)
    with archive.open("rb") as saved:
        os.fsync(saved.fileno())
    restored = root / "restore-probe"
    restored.mkdir(mode=0o700)
    listing = run(["tar", "-tf", str(archive)], check=True, capture_output=True, text=True)
    if listing.stdout.splitlines() != relative:
        raise Refused("archive_members_changed")
    run(["tar", "--xattrs", "--xattrs-include=*", "--acls", "--same-owner", "-xpf", str(archive), "-C", str(restored)],
        check=True, capture_output=True)
    for filename, record in records.items():
        source = Path(filename)
        copy = restored / source.relative_to("/")
        if attributes(copy) != record["attributes"] or digest(copy.read_bytes()) != record["sha256"]:
            raise Refused("actual_restore_failed_byte_or_metadata_verification", filename)
        if source.suffix == ".py":
            ast.parse(copy.read_bytes())
        elif source.suffix == ".json":
            json.loads(copy.read_bytes())
        if attributes(source) != record["attributes"] or digest(source.read_bytes()) != record["sha256"]:
            raise Refused("source_changed_during_backup", filename)
    after_state = state()
    if before_state != after_state:
        raise Refused("service_changed_during_backup")
    manifest = {"version": 1, "files": records, "service_state": after_state,
                "archive_sha256": digest(archive.read_bytes()), "actual_file_restore_verified": True,
                "owner_mode_mtime_xattrs_verified": True, "source_bytes_and_metadata_unchanged": True,
                "service_modified": False, "model_request": False,
                "service_recreation_or_model_restart_tested": False}
    data = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    write_private(root / "manifest.json", data)
    sums = f'{manifest["archive_sha256"]}  artifacts.tar\n{digest(data)}  manifest.json\n'
    write_private(root / "SHA256SUMS", sums.encode())
    # Export into the already existing protected export parent; never alter sources.
    exported = export_parent / name
    exported.mkdir(mode=0o700)
    for name in ("artifacts.tar", "manifest.json", "SHA256SUMS"):
        value = (root / name).read_bytes()
        write_private(exported / name, value)
        if (exported / name).read_bytes() != value:
            raise Refused("export_checksum_verification_failed", name)
        os.chown(exported / name, export_uid, export_gid)
        with (exported / name).open("rb") as saved:
            os.fsync(saved.fileno())
    os.chown(exported, export_uid, export_gid)
    for folder in (root, exported):
        fd = os.open(folder, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    return {"ok": True, "backup": str(root), "export": str(exported), "file_count": len(records),
            "archive_sha256": manifest["archive_sha256"], "manifest_sha256": digest(data),
            "checksums_sha256": digest(sums.encode()), "actual_file_restore_verified": True,
            "owner_mode_mtime_xattrs_verified": True, "source_modified": False, "service_modified": False,
            "model_request": False, "service_recreation_or_model_restart_tested": False}


def verify_reused_base(parent=PARENT, files=FILES,
                       manifest_sha256="6fb8ad9472f47875d01a35b4a3b73284951eeb5dc85048363255563824f36677",
                       archive_sha256="49603207964cb3d37613f38797e7abf33cfeae2a895586be80ddf02433b5cf16"):
    """Reuse the verified five unchanged files; only the newer router pair needs backup."""
    root = parent / NAME
    protected_parent(root, os.geteuid())
    manifest_bytes = (root / "manifest.json").read_bytes()
    if digest(manifest_bytes) != manifest_sha256 or digest((root / "artifacts.tar").read_bytes()) != archive_sha256:
        raise Refused("previous_verified_backup_changed")
    manifest = json.loads(manifest_bytes)
    if set(manifest["files"]) != set(files):
        raise Refused("previous_verified_file_set_changed")
    reused = 0
    for filename, record in manifest["files"].items():
        if filename in DELTA_FILES:
            continue
        source = Path(filename)
        if source.resolve() != source:
            raise Refused("previously_verified_source_path_changed", filename)
        restored = root / "restore-probe" / source.relative_to("/")
        if (digest(source.read_bytes()) != record["sha256"] or digest(restored.read_bytes()) != record["sha256"]
                or attributes(source) != record["attributes"] or attributes(restored) != record["attributes"]):
            raise Refused("previously_verified_source_or_restore_changed", filename)
        reused += 1
    return reused


def service_state(include_learning=False):
    result = {}
    units = ("ai-deepseek.service", "ai-model-router.service", "netaigis-coding-agent.service")
    if include_learning: units += ("ai-agent.service",)
    for unit in units:
        completed = subprocess.run(["systemctl", "show", unit,
                                    "--property=User,Group,ActiveState,SubState,MainPID,InvocationID,FragmentPath,CollectMode"],
                                   capture_output=True, text=True, timeout=10, check=True)
        result[unit] = dict(row.split("=", 1) for row in completed.stdout.splitlines() if "=" in row)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--remote", action="store_true")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--router-context-delta", action="store_true", help="back up only the two router files changed since the verified seven-file snapshot")
    group.add_argument("--recall-projects-delta", action="store_true", help="back up only the two newly affected existing Recall modules")
    group.add_argument("--coding-prefix-cache-delta", action="store_true", help="back up only the existing Coding-Agent app before the reviewed prefix repair")
    args = parser.parse_args()
    if args.remote:
        helper = Path(__file__).with_name("netaigis-coding-agent-adapter-remote.py")
        spec = importlib.util.spec_from_file_location("existing_terminal_transport", helper)
        transport = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(transport)
        source = Path(__file__).read_bytes()
        program = ("import base64,hashlib,sys; s=base64.b64decode(" + repr(base64.b64encode(source).decode())
                   + "); assert hashlib.sha256(s).hexdigest()==" + repr(digest(source))
                   + "; sys.argv=" + repr(["model-context-file-preflight", *(["--router-context-delta"] if args.router_context_delta else []),
                                            *(["--recall-projects-delta"] if args.recall_projects_delta else []),
                                            *(["--coding-prefix-cache-delta"] if args.coding_prefix_cache_delta else [])]) + "; "
                   + "exec(compile(s,'public-model-context-preflight','exec'),{'__name__':'__main__'})")
        with open("/dev/tty") as terminal:
            return subprocess.call(transport.ssh_command(program), stdin=terminal)
    if os.geteuid() != 0:
        raise SystemExit("Root terminal required only for backup and actual owner-preserving restore")
    os.umask(0o077)
    account = pwd.getpwnam("friseer")
    try:
        reused = verify_reused_base() if args.router_context_delta else 0
        selected_files = CODING_PREFIX_FILES if args.coding_prefix_cache_delta else RECALL_PROJECTS_FILES if args.recall_projects_delta else DELTA_FILES if args.router_context_delta else FILES
        selected_name = CODING_PREFIX_NAME if args.coding_prefix_cache_delta else RECALL_PROJECTS_NAME if args.recall_projects_delta else DELTA_NAME if args.router_context_delta else NAME
        report = prepare(selected_files, PARENT, EXPORT, account.pw_uid, account.pw_gid,
                         lambda: service_state(include_learning=args.recall_projects_delta or args.coding_prefix_cache_delta), name=selected_name)
        if args.router_context_delta:
            report["previously_verified_files_reused_without_backup"] = reused
    except Refused as error:
        report = {"ok": False, "failure_class": type(error).__name__, "reason": error.code,
                  "source": error.source, "source_modified": False, "service_modified": False, "model_request": False}
    except (OSError, ValueError, SyntaxError, subprocess.SubprocessError) as error:
        report = {"ok": False, "failure_class": type(error).__name__, "source_modified": False,
                  "service_modified": False, "model_request": False}
    print(json.dumps(report))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
