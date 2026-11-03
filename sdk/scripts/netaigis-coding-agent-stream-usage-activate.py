"""Install only the pinned adapter telemetry fix using the existing verified backup.

No model request, configuration/model change or automatic rollback. Root input
uses the established operator terminal. Inspect is the default operation.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import shlex
import subprocess
import sys

SOURCE = Path('/opt/netaigis-coding-agent/ollama_adapter.py')
BACKUP = Path('/root/netaigis-recall-backups/phase2-20261030T165000Z/phase4-model-context-preflight')
MANIFEST = '6fb8ad9472f47875d01a35b4a3b73284951eeb5dc85048363255563824f36677'
ARCHIVE = '49603207964cb3d37613f38797e7abf33cfeae2a895586be80ddf02433b5cf16'
BEFORE = '307497023baea81eabda77d96045c81fecc605a296748dc0ad163f7e01c4ffd9'
AFTER = '205b879bba773dae0184097fbddbcc01c941f080b89f2969cf41be1563d691eb'


def load(name):
    bundled = globals().get('BUNDLED_ASSETS')
    if bundled:
        namespace = {'__name__': 'bundled_' + name}
        exec(compile(bundled[name], 'reviewed-' + name, 'exec'), namespace)
        from types import SimpleNamespace
        return SimpleNamespace(**namespace)
    filename = {'maintenance': 'netaigis-coding-agent-adapter-maintenance.py',
                'usage': 'netaigis-coding-agent-stream-usage.py'}[name]
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def plan(maintenance, usage, source=SOURCE, backup=BACKUP, manifest_hash=MANIFEST, archive_hash=ARCHIVE):
    if backup.resolve() != backup or backup.is_symlink() or backup.stat().st_uid != os.geteuid() or backup.stat().st_mode & 0o077:
        raise maintenance.Refused('backup_not_protected')
    manifest_bytes = maintenance.regular(backup / 'manifest.json', True)
    if maintenance.digest(manifest_bytes) != manifest_hash or maintenance.digest(maintenance.regular(backup / 'artifacts.tar', True)) != archive_hash:
        raise maintenance.Refused('backup_hash_changed')
    manifest = json.loads(manifest_bytes)
    if not manifest.get('actual_file_restore_verified') or not manifest.get('owner_mode_mtime_xattrs_verified') or manifest.get('archive_sha256') != archive_hash:
        raise maintenance.Refused('backup_restore_proof_missing')
    record = manifest['files'][str(source)]
    if record['sha256'] != BEFORE:
        raise maintenance.Refused('backup_adapter_hash_changed')
    restored = backup / 'restore-probe' / source.relative_to('/')
    if restored.resolve() != restored or source.resolve() != source or source.parent.stat().st_mode & 0o022:
        raise maintenance.Refused('source_or_restore_path_changed')
    original = maintenance.regular(restored)
    if maintenance.digest(original) != BEFORE:
        raise maintenance.Refused('restored_adapter_changed')
    attributes = dict(record['attributes'])
    attributes['xattrs'] = {k: base64.b64decode(v) for k, v in attributes['xattrs'].items()}
    if maintenance.metadata(restored) != attributes:
        raise maintenance.Refused('restore_attributes_changed')
    current = maintenance.regular(source)
    if maintenance.digest(current) not in (BEFORE, AFTER):
        raise maintenance.Refused('productive_adapter_changed')
    actual = maintenance.metadata(source)
    fields = attributes.keys() if maintenance.digest(current) == BEFORE else ('uid', 'gid', 'mode', 'xattrs')
    if any(actual[k] != attributes[k] for k in fields):
        raise maintenance.Refused('productive_adapter_attributes_changed')
    candidate = usage.rewrite(original)
    if maintenance.digest(candidate) != AFTER:
        raise maintenance.Refused('candidate_changed')
    return {'source': source, 'backup': backup, 'original': original,
            'candidate': candidate, 'attributes': attributes}


def apply(maintenance, prepared, controller):
    controller.healthy(); controller.quiet(require_running=True)
    configuration = controller.configuration()
    # Exact retry is a verification, never another restart.
    if maintenance.digest(maintenance.regular(prepared['source'])) == AFTER:
        return {'ok': True, 'already_applied': True, 'source_sha256': AFTER,
                'coding_service': controller.state(), 'model_request': False}
    try:
        controller.stop()
        maintenance.replace_verified(prepared, prepared['candidate'], BEFORE)
        if controller.configuration() != configuration:
            raise maintenance.Refused('configuration_changed')
        controller.quiet(require_running=False)
        controller.start()
        state = controller.healthy()
        if controller.configuration() != configuration:
            raise maintenance.Refused('configuration_changed')
        return {'ok': True, 'source_sha256': AFTER, 'coding_service': state,
                'configuration_bytes_unchanged': True, 'model_request': False,
                'functional_streaming_acceptance_pending': True}
    except Exception:
        # Keep the new version for diagnosis; try to restore service availability.
        try: controller.start()
        except Exception: pass
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['inspect', 'apply'], nargs='?', default='inspect')
    parser.add_argument('--remote', action='store_true')
    parser.add_argument('--maintenance-confirmed', action='store_true')
    parser.add_argument('--external-copy-verified', action='store_true')
    args = parser.parse_args()
    if args.action == 'apply' and not (args.maintenance_confirmed and args.external_copy_verified):
        raise ValueError('maintenance_and_external_copy_confirmation_required')
    if args.remote:
        root = Path(__file__).parent
        files = {'maintenance': 'netaigis-coding-agent-adapter-maintenance.py', 'usage': 'netaigis-coding-agent-stream-usage.py'}
        bundle = {'code': Path(__file__).read_text(), 'assets': {k: (root / v).read_text() for k, v in files.items()}}
        encoded = base64.b64encode(json.dumps(bundle).encode()).decode()
        argv = [args.action] + (['--maintenance-confirmed', '--external-copy-verified'] if args.action == 'apply' else [])
        program = 'import base64,json,sys; p=json.loads(base64.b64decode(' + repr(encoded) + ')); sys.argv=' + repr(['stream-usage-activate', *argv]) + '; exec(compile(p["code"],"reviewed-usage-activate","exec"),{"__name__":"__main__","BUNDLED_ASSETS":p["assets"]})'
        command = ' '.join(shlex.quote(x) for x in ['sudo', 'env', 'PYTHONDONTWRITEBYTECODE=1', 'python3', '-c', program])
        with open('/dev/tty') as terminal:
            return subprocess.call(['ssh', '-t', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', 'friseer@192.168.178.43', command], stdin=terminal)
    if os.geteuid() != 0:
        raise ValueError('root_required_for_existing_backup')
    maintenance, usage = load('maintenance'), load('usage')
    prepared = plan(maintenance, usage)
    result = apply(maintenance, prepared, maintenance.Controller()) if args.action == 'apply' else {'ok': True, 'inspection_only': True, 'source_sha256': maintenance.digest(maintenance.regular(SOURCE)), 'candidate_sha256': AFTER, 'existing_backup_restore_verified': True, 'model_request': False}
    print(json.dumps(result)); return 0


if __name__ == '__main__':
    os.umask(0o077)
    try: result = main()
    except Exception as error:
        print(json.dumps({'ok': False, 'failure_class': type(error).__name__, 'repair_required': True,
                          'automatic_rollback': False, 'model_request': False,
                          'reason': str(error) if re.fullmatch(r'[a-z][a-z0-9_]*', str(error)) else 'protected_operation_failed'}))
        result = 1
    raise SystemExit(result)
