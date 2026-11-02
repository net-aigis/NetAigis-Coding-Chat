"""Deployment guards and real temporary-file replacement, never productive services."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

path=Path(__file__).with_name('netaigis-recall-projects-activate.py')
spec=importlib.util.spec_from_file_location('recall_project_activation_test_target',path)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
API='''def authorize(): pass
def store(): pass
@router.get("/conversations")
def list_conversations(project_id: str, _actor: str | None = Depends(authorize)): pass
'''
STORE='''class RecallStore:
    def _connect(self): pass
    def events(self): pass
    def conversations(self): pass
    def append(self): pass
'''


class RecallProjectActivationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='recall-module-deploy-',dir=os.environ.get('CLINE_DATA_DIR'))
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.backup=self.root/'backup';self.backup.mkdir(mode=0o700)
        self.targets={k:self.root/'source'/('recall_'+k+'.py') for k in ('api','store')}
        self.targets['api'].parent.mkdir(mode=0o700)
        self.assets={k:path.with_name(n).read_text() for k,(n,_) in module.ASSETS.items()}
        self.base=module.primitives(self.assets)
        patcher={'__name__':'fixture_rewriter'}
        exec(self.assets['projects'],patcher)
        candidates=patcher['rewrite'](API,STORE)
        self.originals={'api':API.encode(),'store':STORE.encode()}
        self.candidates=dict(zip(('api','store'),(s.encode() for s in candidates)))
        records={}
        for key,target in self.targets.items():
            target.write_bytes(self.originals[key]);target.chmod(0o644)
            restored=self.backup/'restore-probe'/target.relative_to('/')
            restored.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
            shutil.copy2(target,restored)
            attrs=self.base['metadata'](target)
            attrs['xattrs']={k:base64.b64encode(v).decode() for k,v in attrs['xattrs'].items()}
            records[str(target)]={'sha256':module.digest(self.originals[key]),'attributes':attrs}
        manifest={'files':records,'actual_file_restore_verified':True,'owner_mode_mtime_xattrs_verified':True}
        (self.backup/'manifest.json').write_text(json.dumps(manifest));(self.backup/'manifest.json').chmod(0o600)
        (self.backup/'artifacts.tar').write_bytes(b'fixture archive pinned for verifier tests')
        (self.backup/'artifacts.tar').chmod(0o600)
        (self.backup/'SHA256SUMS').write_text('fixture pinned sums');(self.backup/'SHA256SUMS').chmod(0o600)
        values={'BACKUP':self.backup,'TARGETS':self.targets,
                'BEFORE':{k:module.digest(v) for k,v in self.originals.items()},
                'AFTER':{k:module.digest(v) for k,v in self.candidates.items()},
                'PINS':{n:module.digest((self.backup/n).read_bytes()) for n in module.PINS}}
        self.override=patch.multiple(module,**values);self.override.start();self.addCleanup(self.override.stop)

    def test_unapproved_application_refuses_before_verifying_or_touching_sources(self):
        with patch.object(module,'verify_plan') as verify:
            for installation,quiet in ((False,True),(True,False),(False,False)):
                with self.assertRaisesRegex(module.Refused,'specific_approval'):
                    module.apply(self.assets,'apply',installation,quiet)
            verify.assert_not_called()

    def test_readonly_inspect_validates_exact_source_restore_and_candidate_without_service_control(self):
        with patch.object(module,'protected_states') as services:
            result=module.apply(self.assets)
        self.assertTrue(result['ok']);self.assertFalse(result['source_modified']);self.assertFalse(result['service_modified'])
        services.assert_not_called()
        for key,target in self.targets.items():self.assertEqual(target.read_bytes(),self.originals[key])

    def test_unreviewed_module_or_changed_backup_is_never_overwritten(self):
        self.targets['api'].write_text(API+'\n# unexpected work\n')
        with self.assertRaisesRegex(module.Refused,'unreviewed_recall_source_change'):module.verify_plan(self.assets)
        self.targets['api'].write_bytes(self.originals['api'])
        (self.backup/'artifacts.tar').write_bytes(b'changed')
        with self.assertRaisesRegex(module.Refused,'recall_backup_checksums_changed'):module.verify_plan(self.assets)

    def test_pinned_helpers_and_current_attributes_are_required(self):
        with self.assertRaisesRegex(module.Refused,'assets_changed'):
            module.verify_plan({**self.assets,'projects':self.assets['projects']+'\n# unreviewed\n'})
        self.targets['api'].chmod(0o600)
        with self.assertRaisesRegex(module.Refused,'attributes_changed'):module.verify_plan(self.assets)

    def test_original_module_owner_is_manifest_bound_instead_of_forced_to_the_executor(self):
        target=self.targets['store']
        record=json.loads((self.backup/'manifest.json').read_text())['files'][str(target)]
        with patch.object(module.os,'geteuid',return_value=os.geteuid()+1):
            self.assertEqual(module.manifest_owned_read(target,record,(module.BEFORE['store'],)),self.originals['store'])
        changed=json.loads(json.dumps(record));changed['attributes']['uid']+=1
        with self.assertRaisesRegex(module.Refused,'attributes_changed'):
            module.manifest_owned_read(target,changed,(module.BEFORE['store'],))

    def test_manifest_owned_source_rejects_symlink_and_preserves_inode_checks(self):
        target=self.targets['store']
        record=json.loads((self.backup/'manifest.json').read_text())['files'][str(target)]
        link=target.parent/'unreviewed-link.py';link.symlink_to(target)
        with self.assertRaisesRegex(module.Refused,'path_changed'):
            module.manifest_owned_read(link,record,(module.BEFORE['store'],))

    def test_real_replacement_preserves_attributes_and_allows_idempotent_forward_repair(self):
        base,plans=module.verify_plan(self.assets)
        for key in ('store','api'):
            plan=plans[key];base['replace_verified'](plan,plan['candidate'],plan['current'])
            self.assertEqual(self.targets[key].read_bytes(),self.candidates[key])
            for field in ('uid','gid','mode','xattrs'):
                self.assertEqual(base['metadata'](self.targets[key])[field],plan['attributes'][field])
        _,repaired=module.verify_plan(self.assets)
        self.assertTrue(all(p['current']==module.AFTER[k] for k,p in repaired.items()))

    def test_success_controls_only_existing_coding_controller_and_keeps_other_services(self):
        from unittest.mock import Mock
        base,plans=module.verify_plan(self.assets)
        controller=Mock();controller.configuration.return_value={'unchanged':'fixture-digest'}
        controller.healthy.return_value={'ActiveState':'active','MainPID':'123'}
        base['Controller']=lambda:controller
        protected={u:{'ActiveState':'active','SubState':'running','MainPID':'45','InvocationID':'fixture'} for u in module.PROTECTED}
        catalog={'authenticated_status':200,'projects':[]}
        with patch.object(module,'verify_plan',return_value=(base,plans)), \
             patch.object(module,'protected_states',return_value=protected) as states, \
             patch.object(module,'existing_actor_tokens',return_value={'Friseer':'fixture','jimmi':'fixture2'}), \
             patch.object(module,'verify_catalog',return_value=catalog):
            result=module.apply(self.assets,'apply',True,True)
        self.assertTrue(result['ok']);self.assertTrue(result['protected_services_unchanged'])
        controller.quiet.assert_called_once_with(require_running=True)
        controller.stop.assert_called_once();controller.start.assert_called_once();states.assert_called()
        self.assertEqual(controller.method_calls[2][0],'stop')

    def test_failed_http_acceptance_retains_new_files_and_never_restores_old_implementation(self):
        from unittest.mock import Mock
        base,plans=module.verify_plan(self.assets)
        controller=Mock();controller.configuration.return_value={};base['Controller']=lambda:controller
        protected={u:{'ActiveState':'active','SubState':'running','MainPID':'45'} for u in module.PROTECTED}
        with patch.object(module,'verify_plan',return_value=(base,plans)), \
             patch.object(module,'protected_states',return_value=protected), \
             patch.object(module,'existing_actor_tokens',return_value={}), \
             patch.object(module,'verify_catalog',side_effect=module.Refused('fixture_http_refused')):
            with self.assertRaisesRegex(module.Refused,'fixture_http_refused'):module.apply(self.assets,'apply',True,True)
        for key,target in self.targets.items():self.assertEqual(target.read_bytes(),self.candidates[key])
        controller.stop.assert_called_once();controller.start.assert_called_once()
        log=next(self.backup.glob('recall-projects-activation-*.jsonl')).read_text()
        self.assertIn('repair_required',log);self.assertIn('"automatic_rollback": false',log)

    def test_external_verified_copy_is_reused_and_tampering_is_refused(self):
        report={'actual_local_restore_verified':True,'file_count':2}
        receipt=self.backup/'external-verification.json';receipt.write_text(json.dumps(report));receipt.chmod(0o600)
        with patch.object(module,'EXTERNAL',self.backup):
            module.verify_external()
            (self.backup/'artifacts.tar').write_bytes(b'changed')
            with self.assertRaisesRegex(module.Refused,'external_recall_copy_changed'):module.verify_external()

    def test_catalog_probe_uses_only_get_and_requires_personal_auth_and_identical_catalogs(self):
        from unittest.mock import Mock
        from urllib.error import HTTPError
        catalog={'projects':[{'project_id':'ExistingProject','event_count':2,'conversation_count':1,'last_seq':2}]}
        class Reply:
            status=200
            def __init__(self,body):self.body=body
            def __enter__(self):return self
            def __exit__(self,*_):pass
            def read(self,_):return json.dumps(self.body).encode()
        opener=Mock()
        opener.open.side_effect=[HTTPError('fixture',401,'fixture',{},None),Reply(catalog),Reply(catalog)]
        with patch.object(module.urllib.request,'build_opener',return_value=opener):
            result=module.verify_catalog({'Friseer':'fixture-personal-one','jimmi':'fixture-personal-two'})
        self.assertTrue(result['both_actors_same_catalog'])
        calls=[args[0][0] for args in opener.open.call_args_list]
        self.assertEqual([r.get_method() for r in calls],['GET','GET','GET'])
        self.assertIsNone(calls[0].get_header('Authorization'))
        self.assertNotEqual(calls[1].get_header('Authorization'),calls[2].get_header('Authorization'))
        self.assertNotIn('fixture-personal',json.dumps(result))
        opener.open.side_effect=[Reply(catalog)]
        with patch.object(module.urllib.request,'build_opener',return_value=opener):
            with self.assertRaisesRegex(module.Refused,'unauthenticated_recall_read_allowed'):
                module.verify_catalog({'Friseer':'fixture-one','jimmi':'fixture-two'})


if __name__=='__main__':unittest.main(verbosity=2)
