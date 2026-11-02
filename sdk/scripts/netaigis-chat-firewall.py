"""Permanent local LAN and explicit VPN-host rules for the existing HTTPS dashboard.

No reload, Internet forwarding, certificate trust or Acer changes. Existing
zone files and their actual restoration are checked before any rule mutation.
VPN ranges are not guessed; routed LAN addresses already match this LAN rule.
"""
import argparse
import base64
from decimal import Decimal
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import stat
import subprocess
import tarfile

RULE = 'rule family="ipv4" source address="192.168.178.0/24" port port="8787" protocol="tcp" accept'
PARENT = Path('/home/friseer/MyContainer/backups/cline-phase2-20261030T173159+0100/phase6-vscode-preflight-20261101/productive-rollout/shared-runtime-repair-20261102')
SOURCES = (Path('/etc/firewalld/zones/public.xml'), Path('/etc/firewalld/zones/public.xml.old'),
           Path('/usr/lib/firewalld/zones/public.xml'))
INSPECTED_SOURCE_SHA256 = {
    '/etc/firewalld/zones/public.xml': 'eb83f5324b50fcc7aca1450da6115abab993d9d89f593ef1097a90711fb77a2e',
    '/etc/firewalld/zones/public.xml.old': '0648dd2d581b0e6f7e36bd3033a5245f2ecfe67f1b4c4df6a8ccb9b309b8e56d',
    '/usr/lib/firewalld/zones/public.xml': '0648dd2d581b0e6f7e36bd3033a5245f2ecfe67f1b4c4df6a8ccb9b309b8e56d',
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def attributes(path):
    info = path.stat()
    return {'uid': info.st_uid, 'gid': info.st_gid, 'mode': stat.S_IMODE(info.st_mode),
            'mtime_ns': info.st_mtime_ns,
            'xattrs': {key: base64.b64encode(os.getxattr(path, key)).decode() for key in os.listxattr(path)}}


def firewall(*arguments):
    if '--reload' in arguments or '--runtime-to-permanent' in arguments:
        raise ValueError('broad_firewall_action_refused')
    result = subprocess.run(['/usr/bin/firewall-cmd', *arguments],
                            capture_output=True, text=True, timeout=15, check=True)
    return result.stdout.strip()


def rules(permanent):
    return sorted(firewall(*(['--permanent'] if permanent else []), '--zone=public', '--list-rich-rules').splitlines())


def restore_archived_selinux(member, target, expected):
    value = member.pax_headers.get('RHT.security.selinux', member.pax_headers.get('SCHILY.xattr.security.selinux'))
    if not isinstance(value, str): raise ValueError('selinux_label_missing_from_archive')
    encoded = value.encode('utf-8', 'surrogateescape')
    # GNU tar's SELinux context representation may omit the xattr's NUL.
    candidates = (encoded, encoded + b'\0')
    restored = next((candidate for candidate in candidates if candidate == expected), None)
    if restored is None: raise ValueError('archived_selinux_label_disagrees_with_source')
    # Only the private restore probe, never the productive zone or system policy.
    os.setxattr(target, 'security.selinux', restored)


def prepare_backup(parent, before):
    info = parent.lstat()
    if not stat.S_ISDIR(info.st_mode) or parent.resolve() != parent or info.st_mode & 0o077:
        raise ValueError('existing_private_backup_parent_required')
    records = {}
    for source in SOURCES:
        if not os.path.lexists(source):
            records[str(source)] = {'exists': False}
            continue
        if not source.is_file() or source.resolve() != source:
            raise ValueError('zone_source_type_changed')
        records[str(source)] = {'exists': True, 'sha256': digest(source.read_bytes()), 'attributes': attributes(source)}
    out = parent / 'local-https-firewall-preflight'
    reuse = out.exists()
    if reuse:
        info = out.lstat()
        if out.resolve() != out or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise ValueError('existing_zone_evidence_not_protected')
        if (out / 'manifest.json').exists(): raise ValueError('completed_zone_backup_already_exists')
        # Reuse only the explicitly diagnosed failed attempt, not arbitrary old data.
        if any(str(source) in INSPECTED_SOURCE_SHA256 and records[str(source)].get('sha256') != INSPECTED_SOURCE_SHA256[str(source)] for source in SOURCES):
            raise ValueError('zone_source_changed_since_root_diagnosis')
    else:
        out.mkdir(mode=0o700, exist_ok=False)
    archive = out / 'zone-files.tar'
    files = [name.lstrip('/') for name, record in records.items() if record['exists']]
    if not files:
        raise ValueError('existing_zone_definition_missing')
    if not reuse:
        with archive.open('xb') as output:
            subprocess.run(['tar', '--format=pax', '--acls', '--xattrs', '--selinux', '-cpf', '-', '-C', '/', '--', *files],
                           stdout=output, stderr=subprocess.PIPE, check=True, timeout=20)
            output.flush(); os.fsync(output.fileno())
    archive_sha = digest(archive.read_bytes())
    restored = out / 'restore-probe'
    if not reuse: restored.mkdir(mode=0o700)
    info = restored.lstat()
    if restored.resolve() != restored or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise ValueError('zone_restore_probe_not_protected')
    with tarfile.open(archive) as reader:
        if any(not (entry.isfile() or entry.isdir()) or Path(entry.name).is_absolute()
               or '..' in Path(entry.name).parts for entry in reader):
            raise ValueError('zone_archive_members_invalid')
        members = {member.name: member for member in reader if member.isfile()}
        if set(members) != set(files): raise ValueError('zone_archive_source_set_changed')
        for name in files:
            member, record = members[name], records['/' + name]
            meta = record['attributes']
            if (digest(reader.extractfile(member).read()) != record['sha256']
                    or (member.uid, member.gid, member.mode) != (meta['uid'], meta['gid'], meta['mode'])
                    or int(Decimal(member.pax_headers.get('mtime', str(member.mtime))) * 1000000000) != meta['mtime_ns']):
                raise ValueError('zone_archive_disagrees_with_current_source')
    if not reuse:
        subprocess.run(['tar', '--acls', '--xattrs', '--xattrs-include=*', '--selinux', '--same-owner',
                        '-xpf', str(archive), '-C', str(restored)], capture_output=True, check=True, timeout=20)
    for name, record in records.items():
        original = Path(name)
        if not record['exists']:
            if os.path.lexists(original): raise ValueError('zone_changed_during_backup')
            continue
        copy = restored / name.lstrip('/')
        if copy.resolve() != copy or not copy.is_file(): raise ValueError('zone_restore_target_type_changed')
        label = record['attributes']['xattrs'].get('security.selinux')
        if label is not None and attributes(copy)['xattrs'].get('security.selinux') != label:
            restore_archived_selinux(members[name.lstrip('/')], copy, base64.b64decode(label))
        if (digest(copy.read_bytes()) != record['sha256'] or attributes(copy) != record['attributes']
                or digest(original.read_bytes()) != record['sha256'] or attributes(original) != record['attributes']):
            raise ValueError('actual_zone_restore_or_source_verification_failed')
    manifest = {'rule': RULE, 'before': before, 'records': records, 'actual_restore_verified': True,
                'attributes_verified': True, 'archive_sha256': archive_sha, 'existing_archive_reused': reuse}
    text = json.dumps(manifest, indent=2)
    with (out / 'manifest.json').open('x') as output: output.write(text)
    with (out / 'SHA256SUMS').open('x') as output:
        output.write(manifest['archive_sha256'] + '  zone-files.tar\n' + digest(text.encode()) + '  manifest.json\n')
    if (digest((out / 'manifest.json').read_bytes()) != digest(text.encode())
            or digest(archive.read_bytes()) != manifest['archive_sha256']):
        raise ValueError('zone_backup_checksum_failed')
    return out, manifest


def diagnose():
    out = PARENT / 'local-https-firewall-preflight'
    rows = []
    with tarfile.open(out / 'zone-files.tar') as archive:
        members = {entry.name: entry for entry in archive if entry.isfile()}
        for source in SOURCES:
            row = {'source': str(source), 'source_exists': source.exists()}
            restored = out / 'restore-probe' / str(source).lstrip('/')
            row['restored_exists'] = restored.exists()
            if source.is_file() and restored.is_file():
                original, copy = attributes(source), attributes(restored)
                row['same_content'] = digest(source.read_bytes()) == digest(restored.read_bytes())
                row['different_attributes'] = [key for key in original if original[key] != copy[key]]
                row['source_attributes'] = {key: value for key, value in original.items() if key != 'xattrs'}
                row['restored_attributes'] = {key: value for key, value in copy.items() if key != 'xattrs'}
                row['source_xattr_hashes'] = {key: digest(base64.b64decode(value)) for key, value in original['xattrs'].items()}
                row['restored_xattr_hashes'] = {key: digest(base64.b64decode(value)) for key, value in copy['xattrs'].items()}
            member = members.get(str(source).lstrip('/'))
            if member is not None:
                row['archive_mtime'] = member.pax_headers.get('mtime', str(member.mtime))
                row['archive_content_sha256'] = digest(archive.extractfile(member).read())
            rows.append(row)
    return {'ok': True, 'inspection_only': True, 'files': rows, 'firewall_modified': False,
            'restore_acceptance_pending': True}


def apply(approved=False, vpn_peer=None):
    if not approved: raise ValueError('permanent_lan_rule_approval_required')
    requested = [RULE]
    if vpn_peer is not None:
        peer = ipaddress.ip_address(vpn_peer)
        if (peer.version != 4 or not peer.is_private or peer.is_loopback or peer.is_link_local
                or peer.is_multicast or peer.is_unspecified):
            raise ValueError('explicit_private_vpn_peer_required')
        requested.append('rule family="ipv4" source address="' + str(peer) + '/32" port port="8787" protocol="tcp" accept')
    if firewall('--get-zone-of-interface=wlp3s0') != 'public':
        raise ValueError('wlan_zone_changed')
    before = {'runtime': rules(False), 'permanent': rules(True)}
    if all(set(requested).issubset(value) for value in before.values()):
        return {'ok': True, 'already_present': True, 'rules': requested, 'firewall_modified': False}
    out, manifest = prepare_backup(PARENT, before)
    for name, record in manifest.get('records', {}).items():
        path = Path(name)
        if (os.path.lexists(path) != record['exists'] or record['exists'] and (
                path.resolve() != path or digest(path.read_bytes()) != record['sha256']
                or attributes(path) != record['attributes'])):
            raise ValueError('zone_changed_before_apply')
    for permanent, key in ((True, 'permanent'), (False, 'runtime')):
        current = rules(permanent)
        if current != before[key]: raise ValueError('zone_rules_changed_before_apply')
        for rule in requested:
            if rule not in current:
                firewall(*(['--permanent'] if permanent else []), '--zone=public', '--add-rich-rule=' + rule)
        if rules(permanent) != sorted(set(before[key]) | set(requested)):
            raise ValueError('exact_zone_rule_change_not_confirmed')
    result = {'ok': True, 'rules': requested, 'backup': str(out),
              'manifest_sha256': digest((out / 'manifest.json').read_bytes()),
              'actual_restore_verified': manifest['actual_restore_verified'],
              'permanent_and_runtime_confirmed': True, 'reload': False,
              'acer_modified': False, 'vpn_peer_allowed': vpn_peer, 'vpn_route_modified': False,
              'external_vpn_acceptance_pending': True,
              'rollback_remove_only_from': [key for key, value in before.items() if RULE not in value],
              'rollback_remove_rules': {key: [rule for rule in requested if rule not in value] for key, value in before.items()},
              'firewall_modified': True}
    with (out / 'application.json').open('x') as output: json.dump(result, output, indent=2)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('apply', 'diagnose'))
    parser.add_argument('--permanent-lan-approved', action='store_true')
    parser.add_argument('--vpn-peer', help='Explicit private IPv4 peer; only this /32, never a guessed VPN subnet')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit('Run only in the existing local Root terminal; no password in chat')
    os.umask(0o077)
    try:
        report = diagnose() if args.action == 'diagnose' else apply(args.permanent_lan_approved, args.vpn_peer)
    except Exception as error:
        report = {'ok': False, 'failure_class': type(error).__name__, 'repair_required': True,
                  'automatic_rollback': False}
        if type(error) is ValueError: report['reason'] = str(error)
    print(json.dumps(report))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
