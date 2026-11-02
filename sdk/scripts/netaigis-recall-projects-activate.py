"""Bounded existing Recall project-discovery deployment, read-only by default.

Only two backed-up modules and the existing Coding-Agent stop/start are in scope.
Personal authentication, database, model routing and other services stay intact.
The existing verified maintenance primitives are reused, not a new installer.
"""
import argparse
import ast
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time
import urllib.error
import urllib.request
import uuid

BACKUP = Path('/root/netaigis-recall-backups/phase2-20261030T165000Z/phase4-recall-projects-delta')
EXTERNAL = Path('/home/friseer/MyContainer/backups/cline-phase2-20261030T173159+0100/phase4-recall-projects-delta')
PINS = {'artifacts.tar': 'c2940c6984d8f9e30b23d5c6fded3d387c62db3d8311ae8ec8c8503c1d6ddeed',
        'manifest.json': 'a2a25fbe4b42c617941e4c3b007c3cbcfca3a2427544a4ccba77b2ddf3469d2f',
        'SHA256SUMS': '4ee5b728c61480915c770090ec69ee80686e3805cb79bee4a98252ddb1d7d849'}
TARGETS = {'api': Path('/opt/netaigis-coding-agent/recall_api.py'),
           'store': Path('/opt/netaigis-coding-agent/recall_store.py')}
BEFORE = {'api': '76c17214d28422026ff98a461d44884d9330624765d6e878e16cccda2c070d3b',  # gitleaks:allow -- Public source SHA256, not a credential.
          'store': '7885856b549d4b6b5cb3af51e6f27b95233db108a0e858c74486354085de960b'}
AFTER = {'api': '8c8dde9c566580389fac0113be15e4be5ae6aa62b497d74c7f7786f254f0e1e5',  # gitleaks:allow -- Reviewed public candidate SHA256, not a credential.
         'store': '1c95b9a3b1a27822d1d35fc1eab43808c8094a5e091828d8de83fbab52891cee'}
ASSETS = {'maintenance': ('netaigis-coding-agent-adapter-maintenance.py', '724ef51566b333b228c317cad588da0829ebd0f8ee3de1ba6d3c35538b63f47e'),
          'projects': ('netaigis-recall-projects.py', 'de8eaa774d82780fe481ba2979dca01905b7fc3c434a24ed67fa5f0d7ee48d76')}
PROTECTED = ('ai-agent.service', 'ai-model-router.service', 'ai-deepseek.service')


class Refused(ValueError): pass


def digest(data): return hashlib.sha256(data).hexdigest()


def primitives(assets):
    if set(assets) != set(ASSETS) or any(digest(assets[k].encode()) != sha for k, (_, sha) in ASSETS.items()):
        raise Refused('reviewed_recall_activation_assets_changed')
    result = {'__name__': 'existing_recall_maintenance_primitives'}
    exec(compile(assets['maintenance'], 'pinned-maintenance-primitives', 'exec'), result)
    return result


def manifest_owned_read(path, record, allowed_hashes):
    """Preserve each pinned source owner, including the existing service user's module.

    Root owns the backup envelope, not necessarily the original files inside it.
    Read the same regular inode before/after; never chown a productive source.
    """
    if path.resolve()!=path:raise Refused('recall_owned_input_path_changed')
    descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        before=os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_size>1048576:
            raise Refused('recall_owned_input_type_or_size_changed')
        actual={'uid':before.st_uid,'gid':before.st_gid,'mode':stat.S_IMODE(before.st_mode),
                'mtime_ns':before.st_mtime_ns,
                'xattrs':{k:base64.b64encode(os.getxattr(descriptor,k)).decode() for k in os.listxattr(descriptor)}}
        fields=('uid','gid','mode','xattrs')
        if any(actual[k]!=record['attributes'][k] for k in fields):raise Refused('recall_source_attributes_changed')
        parts=[];size=0
        while True:
            chunk=os.read(descriptor,65536)
            if not chunk:break
            size+=len(chunk)
            if size>1048576:raise Refused('recall_owned_input_type_or_size_changed')
            parts.append(chunk)
        after=os.fstat(descriptor);current=path.lstat()
        stable=('st_dev','st_ino','st_uid','st_gid','st_mode','st_size','st_mtime_ns','st_ctime_ns')
        if any(getattr(before,k)!=getattr(observed,k) for observed in (after,current) for k in stable):
            raise Refused('recall_owned_input_changed_during_read')
        content=b''.join(parts);observed_hash=digest(content)
        if observed_hash not in allowed_hashes:raise Refused('unreviewed_recall_source_change')
        if observed_hash==record['sha256'] and actual['mtime_ns']!=record['attributes']['mtime_ns']:
            raise Refused('recall_source_attributes_changed')
        return content
    finally:os.close(descriptor)


def verify_plan(assets):
    base = primitives(assets)
    info = BACKUP.lstat()
    if BACKUP.resolve() != BACKUP or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise Refused('protected_verified_recall_backup_required')
    for name, expected in PINS.items():
        if digest(base['regular'](BACKUP/name, True)) != expected:
            raise Refused('recall_backup_checksums_changed')
    manifest = json.loads(base['regular'](BACKUP/'manifest.json', True))
    if (set(manifest['files']) != {str(p) for p in TARGETS.values()}
            or not manifest['actual_file_restore_verified'] or not manifest['owner_mode_mtime_xattrs_verified']):
        raise Refused('recall_restore_attestation_invalid')
    root_regular=base['regular']
    owned={}
    for key,path in TARGETS.items():
        record=manifest['files'][str(path)]
        if record['sha256']!=BEFORE[key]:raise Refused('recall_manifest_source_hash_changed')
        owned[path]=(record,(BEFORE[key],AFTER[key]))
        owned[BACKUP/'restore-probe'/path.relative_to('/')]=(record,(BEFORE[key],))
    def regular(path,private=False):
        entry=owned.get(path)
        if entry is None:return root_regular(path,private)
        if private:raise Refused('recall_source_cannot_replace_private_backup_envelope')
        return manifest_owned_read(path,*entry)
    # Existing atomic replacement calls this same checked reader before/after publication.
    base['regular']=regular
    originals = {}
    for key, path in TARGETS.items():
        restored = BACKUP/'restore-probe'/path.relative_to('/')
        content = base['regular'](restored)
        attrs = manifest['files'][str(path)]['attributes'].copy()
        attrs['xattrs'] = {name: base64.b64decode(value, validate=True) for name,value in attrs['xattrs'].items()}
        if digest(content) != BEFORE[key] or base['metadata'](restored) != attrs:
            raise Refused('recall_restored_original_changed')
        originals[key] = content
    patch = {'__name__': 'pinned_recall_project_candidate'}
    exec(compile(assets['projects'], 'pinned-recall-project-rewriter', 'exec'), patch)
    api, store = patch['rewrite'](originals['api'].decode(), originals['store'].decode())
    candidates = {'api': api.encode(), 'store': store.encode()}
    plans = {}
    for key,path in TARGETS.items():
        if digest(candidates[key]) != AFTER[key]: raise Refused('reviewed_recall_candidate_changed')
        parent = path.parent.lstat()
        if path.parent.resolve() != path.parent or parent.st_uid != os.geteuid() or parent.st_mode & 0o022:
            raise Refused('recall_source_parent_not_protected')
        actual = base['regular'](path)
        if digest(actual) not in (BEFORE[key], AFTER[key]): raise Refused('unreviewed_recall_source_change')
        attrs = manifest['files'][str(path)]['attributes'].copy()
        attrs['xattrs'] = {name: base64.b64decode(value, validate=True) for name,value in attrs['xattrs'].items()}
        fields = attrs if digest(actual) == BEFORE[key] else ('uid','gid','mode','xattrs')
        if any(base['metadata'](path)[field] != attrs[field] for field in fields):
            raise Refused('recall_source_attributes_changed')
        plans[key] = {'source':path,'candidate':candidates[key],'attributes':attrs,'current':digest(actual)}
    return base, plans


def protected_states():
    result = {}
    for unit in PROTECTED:
        response = subprocess.run(['systemctl','show',unit,'--property=ActiveState,SubState,MainPID,InvocationID'],
                                  capture_output=True,text=True,timeout=8,check=True)
        result[unit] = dict(line.split('=',1) for line in response.stdout.splitlines() if '=' in line)
    return result


def existing_actor_tokens():
    path = Path('/etc/netaigis-coding-agent/recall-actors.env')
    rows = [line.partition('=')[2].strip() for line in path.read_text().splitlines()
            if line.startswith('RECALL_ACTOR_TOKENS_JSON=')]
    if len(rows) != 1: raise Refused('existing_recall_actor_map_not_confirmed')
    raw = rows[0]
    if raw.startswith(('"',"'")): raw = ast.literal_eval(raw)
    tokens = json.loads(raw)
    if set(tokens) != {'Friseer','jimmi'} or any(not isinstance(t,str) or not t for t in tokens.values()):
        raise Refused('existing_recall_actor_map_not_confirmed')
    return tokens


def verify_catalog(tokens):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args): return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    url = 'http://127.0.0.1:11436/internal/recall/projects'
    def request(token=None):
        headers = {'Connection':'close'}
        if token: headers['Authorization']='Bearer '+token
        with opener.open(urllib.request.Request(url,headers=headers),timeout=5) as reply:
            raw = reply.read(1048577)
            if len(raw)>1048576: raise Refused('project_catalog_response_unbounded')
            return reply.status,json.loads(raw)
    try:
        request()
        raise Refused('unauthenticated_recall_read_allowed')
    except urllib.error.HTTPError as error:
        if error.code != 401: raise Refused('unauthenticated_recall_status_unexpected')
    catalogs = []
    for actor in ('Friseer','jimmi'):
        status, value = request(tokens[actor])
        rows = value.get('projects') if isinstance(value,dict) else None
        if status != 200 or not isinstance(rows,list): raise Refused('authenticated_project_catalog_invalid')
        ids = []
        for row in rows:
            if (not isinstance(row,dict) or not isinstance(row.get('project_id'),str) or not row['project_id']
                    or any(type(row.get(k)) is not int or row[k]<1 for k in ('event_count','conversation_count','last_seq'))):
                raise Refused('authenticated_project_catalog_invalid')
            ids.append(row['project_id'])
        if len(ids)!=len(set(ids)): raise Refused('duplicate_project_catalog_identity')
        catalogs.append(rows)
    if catalogs[0]!=catalogs[1]: raise Refused('personal_actors_project_catalog_disagrees')
    return {'unauthenticated_status':401,'authenticated_status':200,'both_actors_same_catalog':True,
            'projects':catalogs[0],'read_only_requests':True}


def apply(assets, action='inspect', installation_approved=False, maintenance_confirmed=False):
    if action not in ('inspect','apply','repair'): raise Refused('unsupported_recall_activation_action')
    if action != 'inspect' and (not installation_approved or not maintenance_confirmed):
        raise Refused('specific_approval_and_quiet_window_required')
    base, plans = verify_plan(assets)
    result = {'action':action,'files':{str(TARGETS[k]):AFTER[k] for k in TARGETS},'model_request':False}
    if action=='inspect': return {'ok':True,**result,'source_modified':False,'service_modified':False}
    controller = base['Controller']()
    controller.quiet(require_running=action=='apply')
    protected = protected_states()
    if any(s.get('ActiveState')!='active' or s.get('SubState')!='running' or int(s.get('MainPID','0'))<1 for s in protected.values()):
        raise Refused('protected_services_not_running')
    configuration = controller.configuration()
    tokens = existing_actor_tokens()
    journal = BACKUP/('recall-projects-activation-'+uuid.uuid4().hex+'.jsonl')
    with os.fdopen(os.open(journal,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as output:
        def record(stage, **values):
            row={'stage':stage,'at':time.time(),**values}
            output.write(json.dumps(row)+'\n');output.flush();os.fsync(output.fileno())
            print(json.dumps({'progress':True,**row}),flush=True)
        record('checked',**result)
        try:
            controller.stop()
            # Store first: a partially applied repair never publishes an API with a missing method.
            for key in ('store','api'):
                plan=plans[key]
                if plan['current']!=AFTER[key]: base['replace_verified'](plan,plan['candidate'],plan['current'])
                record('file_verified',path=str(plan['source']),sha256=AFTER[key])
            controller.start(); coding=controller.healthy()
            catalog=verify_catalog(tokens)
            if controller.configuration()!=configuration or protected_states()!=protected:
                raise Refused('protected_configuration_or_service_changed')
            if any(digest(base['regular'](TARGETS[k]))!=AFTER[k] for k in TARGETS):
                raise Refused('activated_recall_module_changed')
            record('verified',catalog=catalog,coding_service=coding)
            return {'ok':True,**result,'catalog':catalog,'coding_service':coding,'journal':str(journal),
                    'protected_services_unchanged':True,'configuration_unchanged':True,
                    'source_modified':any(p['current']!=AFTER[k] for k,p in plans.items()),'service_modified':True,
                    'productive_archival_acceptance_pending':True}
        except Exception:
            record('repair_required',automatic_rollback=False,new_implementation_retained=True)
            raise


def verify_external():
    info=EXTERNAL.lstat()
    if EXTERNAL.resolve()!=EXTERNAL or info.st_uid!=os.getuid() or info.st_mode&0o077:
        raise Refused('external_recall_copy_not_protected')
    for name,expected in PINS.items():
        entry=(EXTERNAL/name).lstat()
        if not (EXTERNAL/name).is_file() or (EXTERNAL/name).is_symlink() or entry.st_uid!=os.getuid() or entry.st_mode&0o077:
            raise Refused('external_recall_artifact_not_protected')
        if digest((EXTERNAL/name).read_bytes())!=expected: raise Refused('external_recall_copy_changed')
    report=json.loads((EXTERNAL/'external-verification.json').read_text())
    if not report.get('actual_local_restore_verified') or report.get('file_count')!=2:
        raise Refused('external_recall_restore_not_verified')
    manifest=json.loads((EXTERNAL/'manifest.json').read_text())
    for key,path in TARGETS.items():
        restored=EXTERNAL/'restore-probe'/path.relative_to('/')
        if digest(restored.read_bytes())!=BEFORE[key] or manifest['files'][str(path)]['sha256']!=BEFORE[key]:
            raise Refused('external_recall_restored_module_changed')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('inspect','apply','repair'),nargs='?',default='inspect')
    parser.add_argument('--remote',action='store_true')
    parser.add_argument('--installation-approved',action='store_true')
    parser.add_argument('--maintenance-confirmed',action='store_true')
    options=parser.parse_args()
    assets=globals().get('RECALL_ACTIVATION_ASSETS') or {k:Path(__file__).with_name(n).read_text() for k,(n,_) in ASSETS.items()}
    primitives(assets)
    if options.remote:
        verify_external()
        helper=Path(__file__).with_name('netaigis-coding-agent-adapter-remote.py')
        spec=importlib.util.spec_from_file_location('existing_recall_terminal_transport',helper)
        transport=importlib.util.module_from_spec(spec);spec.loader.exec_module(transport)
        argv=['recall-project-activation',options.action]
        if options.installation_approved:argv.append('--installation-approved')
        if options.maintenance_confirmed:argv.append('--maintenance-confirmed')
        bundle=base64.b64encode(json.dumps({'source':Path(__file__).read_text(),'assets':assets}).encode()).decode()
        program=('import base64,json,sys;b=json.loads(base64.b64decode('+repr(bundle)+'));sys.argv='+repr(argv)
                 +';exec(compile(b["source"],"public-recall-project-activation","exec"),'
                 +'{"__name__":"__main__","RECALL_ACTIVATION_ASSETS":b["assets"]})')
        with open('/dev/tty') as terminal:return subprocess.call(transport.ssh_command(program),stdin=terminal)
    if os.geteuid()!=0:raise SystemExit('Existing Root terminal required; no credentials in chat')
    os.umask(0o077)
    try:report=apply(assets,options.action,options.installation_approved,options.maintenance_confirmed)
    except Exception as error:
        report={'ok':False,'failure_class':type(error).__name__,'repair_required':True,'model_request':False,'automatic_rollback':False}
        if isinstance(error,Refused) or type(error).__name__=='Refused':
            if re.fullmatch('[a-z_]{1,120}',str(error)):report['reason']=str(error)
    print(json.dumps(report));return 0 if report['ok'] else 1


if __name__=='__main__':raise SystemExit(main())
