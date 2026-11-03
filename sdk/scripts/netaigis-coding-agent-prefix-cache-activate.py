"""Bounded Coding-Agent prefix repair using the verified one-file backup.

Inspect by default. Apply requires explicit maintenance/external-copy flags and
operator Root input. No model request, automatic rollback or other service control.
"""
import argparse
import base64
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
from types import SimpleNamespace

SOURCE = Path('/opt/netaigis-coding-agent/app.py')
BACKUP = Path('/root/netaigis-recall-backups/phase2-20261030T165000Z/phase4-coding-prefix-cache-delta')
MANIFEST = 'e562454d23f0761239177f1932af3015cce3aefc52551331c44eba07e51d115b'
ARCHIVE = '971e317aa9bdbf39d539c58a4abe24d5513941ea20c119a7aa0285102e358c40'
BEFORE = 'ca9817079d3081eff10b4020cd44b298259963321522d449eb77c0d4073d6201'
AFTER = 'a85a9065358c55ae90bc85faac58d7dfd99daccebce51436178f417f7a513a0a'
ASSETS = {'maintenance': 'netaigis-coding-agent-adapter-maintenance.py',
          'activation': 'netaigis-coding-agent-stream-usage-activate.py',
          'prefix': 'netaigis-coding-agent-prefix-cache.py'}


def load(name):
    bundled = globals().get('BUNDLED_ASSETS')
    if bundled:
        ns = {'__name__': 'reviewed_prefix_' + name}
        exec(compile(bundled[name], 'reviewed-prefix-' + name, 'exec'), ns)
        return SimpleNamespace(**ns)
    spec = importlib.util.spec_from_file_location('prefix_' + name, Path(__file__).with_name(ASSETS[name]))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def activation():
    # Reuse the already tested exact-restore/attribute-preserving transaction.
    module = load('activation')
    # apply() reads these from its execution globals, including bundled modules.
    module.apply.__globals__['BEFORE'] = BEFORE
    module.apply.__globals__['AFTER'] = AFTER
    module.plan.__globals__['BEFORE'] = BEFORE
    module.plan.__globals__['AFTER'] = AFTER
    return module


def plan(maintenance, prefix, source=SOURCE, backup=BACKUP, manifest_hash=MANIFEST, archive_hash=ARCHIVE):
    return activation().plan(maintenance, prefix, source, backup, manifest_hash, archive_hash)


def protected_services():
    result = {}
    for unit in ('ai-agent.service', 'ai-model-router.service', 'ai-deepseek.service'):
        raw = subprocess.check_output(['systemctl', 'show', unit, '-p', 'MainPID', '-p', 'InvocationID',
                                       '-p', 'ActiveState', '-p', 'SubState', '-p', 'NRestarts'], text=True, timeout=8)
        result[unit] = dict(line.split('=', 1) for line in raw.splitlines() if '=' in line)
    return result


def apply(maintenance, prepared, controller, observe=None):
    observe = observe or protected_services
    before = observe()
    result = activation().apply(maintenance, prepared, controller)
    if observe() != before:
        raise maintenance.Refused('protected_service_state_changed')
    result.pop('functional_streaming_acceptance_pending', None)
    result.update(protected_services_unchanged=True, prefix_cache_inference_acceptance_pending=True)
    return result


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
        bundle = {'code': Path(__file__).read_text(), 'assets': {k: (root / v).read_text() for k, v in ASSETS.items()}}
        encoded = base64.b64encode(json.dumps(bundle).encode()).decode()
        argv = [args.action] + (['--maintenance-confirmed', '--external-copy-verified'] if args.action == 'apply' else [])
        program = ('import base64,json,sys; p=json.loads(base64.b64decode(' + repr(encoded)
                   + ')); sys.argv=' + repr(['prefix-cache-activate', *argv])
                   + '; exec(compile(p["code"],"reviewed-prefix-activate","exec"),{"__name__":"__main__","BUNDLED_ASSETS":p["assets"]})')
        command = ' '.join(shlex.quote(x) for x in ['sudo', 'env', 'PYTHONDONTWRITEBYTECODE=1', 'python3', '-c', program])
        with open('/dev/tty') as terminal:
            return subprocess.call(['ssh', '-t', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                                    '-o', 'ConnectTimeout=8', 'friseer@192.168.178.43', command], stdin=terminal)
    if os.geteuid() != 0:
        raise ValueError('root_required_for_existing_backup')
    maintenance, prefix = load('maintenance'), load('prefix')
    prepared = plan(maintenance, prefix)
    result = apply(maintenance, prepared, maintenance.Controller()) if args.action == 'apply' else {
        'ok': True, 'inspection_only': True, 'source_sha256': maintenance.digest(maintenance.regular(SOURCE)),
        'candidate_sha256': AFTER, 'existing_backup_restore_verified': True, 'model_request': False}
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    os.umask(0o077)
    try:
        result = main()
    except Exception as error:
        print(json.dumps({'ok': False, 'failure_class': type(error).__name__, 'repair_required': True,
                          'automatic_rollback': False, 'model_request': False,
                          'reason': str(error) if re.fullmatch(r'[a-z][a-z0-9_]*', str(error)) else 'protected_operation_failed'}))
        result = 1
    raise SystemExit(result)
