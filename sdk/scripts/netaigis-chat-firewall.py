"""One permanent local LAN rule for the existing HTTPS session dashboard.

No reload, Internet forwarding, certificate trust or Acer changes. Existing
zone files and their actual restoration are checked before any rule mutation.
VPN ranges are not guessed; routed LAN addresses already match this LAN rule.
"""
import argparse
import base64
import hashlib
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
    out.mkdir(mode=0o700, exist_ok=False)
    archive = out / 'zone-files.tar'
    files = [name.lstrip('/') for name, record in records.items() if record['exists']]
    if not files:
        raise ValueError('existing_zone_definition_missing')
    with archive.open('xb') as output:
        subprocess.run(['tar', '--format=pax', '--acls', '--xattrs', '--selinux', '-cpf', '-', '-C', '/', '--', *files],
                       stdout=output, stderr=subprocess.PIPE, check=True, timeout=20)
        output.flush(); os.fsync(output.fileno())
    restored = out / 'restore-probe'
    restored.mkdir(mode=0o700)
    with tarfile.open(archive) as reader:
        if any(not (entry.isfile() or entry.isdir()) or Path(entry.name).is_absolute()
               or '..' in Path(entry.name).parts for entry in reader):
            raise ValueError('zone_archive_members_invalid')
    subprocess.run(['tar', '--acls', '--xattrs', '--xattrs-include=*', '--selinux', '--same-owner',
                    '-xpf', str(archive), '-C', str(restored)], capture_output=True, check=True, timeout=20)
    for name, record in records.items():
        original = Path(name)
        if not record['exists']:
            if os.path.lexists(original): raise ValueError('zone_changed_during_backup')
            continue
        copy = restored / name.lstrip('/')
        if (digest(copy.read_bytes()) != record['sha256'] or attributes(copy) != record['attributes']
                or digest(original.read_bytes()) != record['sha256'] or attributes(original) != record['attributes']):
            raise ValueError('actual_zone_restore_or_source_verification_failed')
    manifest = {'rule': RULE, 'before': before, 'records': records, 'actual_restore_verified': True,
                'attributes_verified': True, 'archive_sha256': digest(archive.read_bytes())}
    text = json.dumps(manifest, indent=2)
    with (out / 'manifest.json').open('x') as output: output.write(text)
    with (out / 'SHA256SUMS').open('x') as output:
        output.write(manifest['archive_sha256'] + '  zone-files.tar\n' + digest(text.encode()) + '  manifest.json\n')
    if (digest((out / 'manifest.json').read_bytes()) != digest(text.encode())
            or digest(archive.read_bytes()) != manifest['archive_sha256']):
        raise ValueError('zone_backup_checksum_failed')
    return out, manifest


def apply(approved=False):
    if not approved: raise ValueError('permanent_lan_rule_approval_required')
    if firewall('--get-zone-of-interface=wlp3s0') != 'public':
        raise ValueError('wlan_zone_changed')
    before = {'runtime': rules(False), 'permanent': rules(True)}
    if all(RULE in value for value in before.values()):
        return {'ok': True, 'already_present': True, 'rule': RULE, 'firewall_modified': False}
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
        if RULE not in current:
            firewall(*(['--permanent'] if permanent else []), '--zone=public', '--add-rich-rule=' + RULE)
        if rules(permanent) != sorted(set(before[key]) | {RULE}):
            raise ValueError('exact_zone_rule_change_not_confirmed')
    result = {'ok': True, 'rule': RULE, 'backup': str(out),
              'manifest_sha256': digest((out / 'manifest.json').read_bytes()),
              'actual_restore_verified': manifest['actual_restore_verified'],
              'permanent_and_runtime_confirmed': True, 'reload': False,
              'acer_modified': False, 'vpn_additional_range_configured': False,
              'rollback_remove_only_from': [key for key, value in before.items() if RULE not in value],
              'firewall_modified': True}
    with (out / 'application.json').open('x') as output: json.dump(result, output, indent=2)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('apply',))
    parser.add_argument('--permanent-lan-approved', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit('Run only in the existing local Root terminal; no password in chat')
    os.umask(0o077)
    try:
        report = apply(args.permanent_lan_approved)
    except Exception as error:
        report = {'ok': False, 'failure_class': type(error).__name__, 'repair_required': True,
                  'automatic_rollback': False}
        if type(error) is ValueError: report['reason'] = str(error)
    print(json.dumps(report))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
