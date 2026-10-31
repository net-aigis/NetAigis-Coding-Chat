"""Root-only backup/restore proof on Acer. Never changes production files/services.

Keeps the full private module on Acer, below the existing Phase-2 root backup.
No model requests, secrets output, source replacement or service control.
Existing evidence is never overwritten. Run once before productive approval.
"""
import ast
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess

SOURCE = Path("/opt/netaigis-coding-agent/ollama_adapter.py")
PARENT = Path("/root/netaigis-recall-backups/phase2-20261030T165000Z")
SHA256 = "cdf5d6768d8fffb9e3d1d0f4b08db9784a5ce5b432003f4cf16d4f3a970c8b81"


def attributes(path):
    info = path.stat()
    return {"uid": info.st_uid, "gid": info.st_gid, "mode": stat.S_IMODE(info.st_mode),
            "mtime_ns": info.st_mtime_ns,
            "xattrs": {name: os.getxattr(path, name) for name in os.listxattr(path)}}


def prepare(source, parent, expected_sha256=SHA256):
    if source.is_symlink() or not source.is_file():
        raise ValueError("Source must be a regular file")
    if parent.is_symlink() or not parent.is_dir() or stat.S_IMODE(parent.stat().st_mode) & 0o077:
        raise ValueError("Existing private backup parent required")
    original = source.read_bytes()
    if hashlib.sha256(original).hexdigest() != expected_sha256:
        raise ValueError("Source changed; pinned repair must be reviewed again")
    before = attributes(source)
    ast.parse(original)
    root = parent / "phase4-ollama-adapter-preflight"
    root.mkdir(mode=0o700)  # Exclusive: preserve completed or partial prior evidence.
    archive = root / "adapter.tar"
    restored = root / "restore-probe"
    restored.mkdir(mode=0o700)
    with archive.open("xb") as target:
        os.fchmod(target.fileno(), 0o600)
        subprocess.run(["tar", "--format=pax", "--acls", "--xattrs", "--selinux", "-cpf", "-",
                        "-C", str(source.parent), "--", source.name], stdout=target, stderr=subprocess.PIPE, check=True)
        target.flush()
        os.fsync(target.fileno())
    subprocess.run(["tar", "--acls", "--xattrs", "--xattrs-include=*", "--selinux", "--same-owner", "-xpf",
                    str(archive), "-C", str(restored)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    copy = restored / source.name
    if copy.is_symlink() or not copy.is_file() or copy.read_bytes() != original or attributes(copy) != before:
        raise ValueError("Actual file restore failed byte/metadata verification")
    ast.parse(copy.read_bytes())
    if source.read_bytes() != original or attributes(source) != before:
        raise ValueError("Source changed during backup; no productive action is permitted")
    archive_sha = hashlib.sha256(archive.read_bytes()).hexdigest()
    manifest = {"source": str(source), "source_sha256": expected_sha256,
                "archive_sha256": archive_sha, "restore_verified": True,
                "owner_mode_verified": True, "mtime_xattrs_verified": True,
                "source_modified": False, "service_modified": False, "model_request": False}
    manifest_text = json.dumps(manifest, indent=2) + "\n"
    manifest_sha = hashlib.sha256(manifest_text.encode()).hexdigest()
    for name, value in [("manifest.json", manifest_text),
                        ("SHA256SUMS", f"{archive_sha}  adapter.tar\n{expected_sha256}  restore-probe/{source.name}\n{manifest_sha}  manifest.json\n")]:
        with (root / name).open("x") as target:
            os.fchmod(target.fileno(), 0o600)
            target.write(value)
            target.flush()
            os.fsync(target.fileno())
    for name, expected in [(archive, archive_sha), (copy, expected_sha256), (root / "manifest.json", manifest_sha)]:
        if hashlib.sha256(name.read_bytes()).hexdigest() != expected:
            raise ValueError("Checksum re-read failed")
    descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return {"backup": str(root), "manifest_sha256": manifest_sha, **manifest}


if __name__ == "__main__":
    if os.geteuid() != 0:
        raise SystemExit("Run on Acer as root; no production change is performed")
    os.umask(0o077)
    print(json.dumps(prepare(SOURCE, PARENT)))
