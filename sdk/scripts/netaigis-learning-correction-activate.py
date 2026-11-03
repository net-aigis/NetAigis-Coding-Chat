"""Bounded Learning-Agent correction-output repair using the verified one-file backup.

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
import stat
import subprocess
from types import SimpleNamespace

SOURCE = Path('/opt/ai-agent/app.py')
BACKUP = Path('/root/netaigis-recall-backups/phase2-20261030T165000Z/phase4-learning-correction-output-delta')
MANIFEST = 'f4bafa66dcdf2fb2b62f618e37671b59994be314551e6097a941935d51d82992'
ARCHIVE = '2f14e38eb2f3fb751df8b7ce8592fa511af942bdc607771cb4e42b66e65e8f98'
BEFORE = 'b68af9d9954b616b47d127f8d3e62d93ae86ad5d6ffcc58df7eae9a8490de7dd'
AFTER = '4fc273648ce62962b42a4f604d659dc54344695451c439bcc8fd58b32127f3f4'
ASSETS = {'maintenance': 'netaigis-coding-agent-adapter-maintenance.py',
          'activation': 'netaigis-coding-agent-stream-usage-activate.py',
          'prefix': 'netaigis-learning-correction-output.py'}


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
    # Backup envelopes remain Root/private. Productive and restored module ownership
    # must match the pinned manifest, not the UID of the Root maintenance process.
    if backup.resolve() != backup or backup.is_symlink() or backup.stat().st_uid != os.geteuid() or backup.stat().st_mode & 0o077:
        raise maintenance.Refused('backup_not_protected')
    original_regular = getattr(maintenance, '_prefix_original_regular', maintenance.regular)
    manifest_bytes = original_regular(backup / 'manifest.json', True)
    if maintenance.digest(manifest_bytes) != manifest_hash:
        raise maintenance.Refused('backup_hash_changed')
    expected_uid = json.loads(manifest_bytes)['files'][str(source)]['attributes']['uid']
    restored = backup / 'restore-probe' / source.relative_to('/')

    def checked_regular(path, private=False):
        temporary = path.parent == source.parent and re.fullmatch(r'\.ollama-adapter-phase4-[0-9a-f]{32}', path.name)
        if not private and (path in (source, restored) or temporary):
            info = path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != expected_uid:
                raise maintenance.Refused('source_owner_or_type_changed')
            return path.read_bytes()
        return original_regular(path, private)

    # This is a fresh, process-local maintenance asset, never the installed service
    # module. Keep the shared helper and every other deployment's defaults intact.
    maintenance._prefix_original_regular = original_regular
    maintenance.regular = checked_regular
    maintenance.replace_verified.__globals__['regular'] = checked_regular
    return activation().plan(maintenance, prefix, source, backup, manifest_hash, archive_hash)


def protected_services():
    result = {}
    for unit in ('netaigis-coding-agent.service', 'ai-model-router.service', 'ai-deepseek.service'):
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
    result['learning_service'] = result.pop('coding_service')
    result.update(protected_services_unchanged=True, learning_inference_acceptance_pending=True)
    return result


def learning_controller(maintenance):
    # A fresh bundled maintenance module: no shared or installed source is edited.
    maintenance.Controller.command.__globals__['UNIT'] = 'ai-agent.service'
    class LearningController(maintenance.Controller):
        def quiet(self, require_running=True):
            state = self.details()
            if any(key not in state or state[key] for key in maintenance.ISOLATION_PROPERTIES):
                raise maintenance.Refused('isolated_learning_stop_start_not_confirmed')
            running = state.get('ActiveState') == 'active' and state.get('SubState') == 'running' and int(state.get('MainPID', '0')) > 0
            stopped = state.get('ActiveState') in ('inactive', 'failed') and state.get('MainPID') == '0'
            if state.get('LoadState') != 'loaded' or not (running or (not require_running and stopped)):
                raise maintenance.Refused('learning_service_state_not_confirmed')
            for filename in ('/proc/net/tcp', '/proc/net/tcp6'):
                for line in Path(filename).read_text().splitlines()[1:]:
                    fields = line.split()
                    if fields[3] in ('01', '03', '08') and int(fields[1].split(':')[-1], 16) == 11435:
                        raise maintenance.Refused('learning_service_has_established_connections')

        def configuration(self):
            files = ('/opt/ai-agent/config.yaml', '/etc/systemd/system/ai-agent.service',
                     '/etc/systemd/system/ai-agent.service.d/model-router.conf')
            return {path: maintenance.digest(Path(path).read_bytes()) for path in files}

        def healthy(self):
            import time
            import urllib.request
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, request, fp, code, message, headers, new_url):
                    return None
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                try:
                    request = urllib.request.Request('http://127.0.0.1:11435/health', headers={'Connection': 'close'})
                    with opener.open(request, timeout=2) as response:
                        body = json.loads(response.read(65536))
                        if response.status == 200 and isinstance(body, dict) and body.get('status') == 'ok':
                            state = self.state()
                            if state.get('ActiveState') == 'active' and state.get('SubState') == 'running' and int(state.get('MainPID', '0')) > 0:
                                return state
                except Exception:
                    pass
                # Bounded startup readiness only; never repeated model/tool turns.
                time.sleep(0.2)
            raise maintenance.Refused('learning_service_health_not_confirmed')
    return LearningController()


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
                   + ')); sys.argv=' + repr(['learning-correction-activate', *argv])
                   + '; exec(compile(p["code"],"reviewed-prefix-activate","exec"),{"__name__":"__main__","BUNDLED_ASSETS":p["assets"]})')
        command = ' '.join(shlex.quote(x) for x in ['sudo', 'env', 'PYTHONDONTWRITEBYTECODE=1', 'python3', '-c', program])
        with open('/dev/tty') as terminal:
            return subprocess.call(['ssh', '-t', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                                    '-o', 'ConnectTimeout=8', 'friseer@192.168.178.43', command], stdin=terminal)
    if os.geteuid() != 0:
        raise ValueError('root_required_for_existing_backup')
    maintenance, prefix = load('maintenance'), load('prefix')
    prepared = plan(maintenance, prefix)
    result = apply(maintenance, prepared, learning_controller(maintenance)) if args.action == 'apply' else {
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
