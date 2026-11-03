"""Real fixture files/replacement, simulated service control; never production."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('activate', Path(__file__).with_name('netaigis-coding-agent-stream-usage-activate.py'))
a = importlib.util.module_from_spec(spec); spec.loader.exec_module(a)
m = a.load('maintenance')

class Controller:
    def __init__(self): self.calls=[]; self.busy=False; self.fail=False; self.changed=False
    def healthy(self):
        self.calls.append('health')
        if self.fail and 'start' in self.calls: raise ValueError('fixture_health_failure')
        return {'ActiveState':'active'}
    def quiet(self, require_running=True):
        self.calls.append('quiet')
        if self.busy: raise ValueError('fixture_busy')
    def configuration(self): return {'config':'changed' if self.changed and 'stop' in self.calls else 'same'}
    def stop(self): self.calls.append('stop')
    def start(self): self.calls.append('start')
    def state(self): return {'ActiveState':'active'}

class Activation(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir=os.environ['CLINE_DATA_DIR']);self.addCleanup(self.tmp.cleanup)
        root=Path(self.tmp.name);self.source=root/'source'/'adapter.py';self.source.parent.mkdir(mode=0o700)
        self.old=b'value="before"\n';self.new=b'value="after"\n';self.source.write_bytes(self.old);self.source.chmod(0o640)
        self.backup=root/'existing-backup';self.backup.mkdir(mode=0o700)
        restored=self.backup/'restore-probe'/self.source.relative_to('/');restored.parent.mkdir(parents=True);shutil.copy2(self.source,restored)
        archive=self.backup/'artifacts.tar';archive.write_bytes(b'fixture archive');archive.chmod(0o600)
        meta=m.metadata(self.source);meta['xattrs']={k:base64.b64encode(v).decode() for k,v in meta['xattrs'].items()}
        manifest={'files':{str(self.source):{'sha256':m.digest(self.old),'attributes':meta}},'archive_sha256':m.digest(archive.read_bytes()),'actual_file_restore_verified':True,'owner_mode_mtime_xattrs_verified':True}
        p=self.backup/'manifest.json';p.write_text(json.dumps(manifest));p.chmod(0o600)
        self.hash=m.digest(p.read_bytes());self.archivehash=manifest['archive_sha256']
        self.addCleanup(patch.stopall);patch.object(a,'BEFORE',m.digest(self.old)).start();patch.object(a,'AFTER',m.digest(self.new)).start()
    def plan(self):
        return a.plan(m,SimpleNamespace(rewrite=lambda _:self.new),self.source,self.backup,self.hash,self.archivehash)
    def test_reuses_exact_restore_and_preserves_attributes_during_apply(self):
        plan=self.plan();before=m.metadata(self.source);c=Controller();result=a.apply(m,plan,c)
        self.assertTrue(result['ok']);self.assertEqual(self.source.read_bytes(),self.new)
        for k in ('uid','gid','mode','xattrs'):self.assertEqual(m.metadata(self.source)[k],before[k])
        self.assertEqual(c.calls.count('stop'),1);self.assertEqual(c.calls.count('start'),1)
        again=Controller();self.assertTrue(a.apply(m,self.plan(),again)['already_applied']);self.assertNotIn('stop',again.calls)
    def test_refuses_changed_source_without_service_control(self):
        self.source.write_bytes(b'foreign change\n')
        with self.assertRaises(m.Refused):self.plan()
    def test_refuses_tampered_backup(self):
        (self.backup/'artifacts.tar').write_bytes(b'changed')
        with self.assertRaises(m.Refused):self.plan()
    def test_refuses_missing_restore_evidence(self):
        p=self.backup/'manifest.json';d=json.loads(p.read_text());d['actual_file_restore_verified']=False;p.write_text(json.dumps(d));self.hash=m.digest(p.read_bytes())
        with self.assertRaises(m.Refused):self.plan()
    def test_busy_never_stops_or_writes(self):
        c=Controller();c.busy=True
        with self.assertRaises(ValueError):a.apply(m,self.plan(),c)
        self.assertNotIn('stop',c.calls);self.assertEqual(self.source.read_bytes(),self.old)
    def test_failed_new_health_retains_new_version_and_attempts_start(self):
        c=Controller();c.fail=True
        with self.assertRaises(ValueError):a.apply(m,self.plan(),c)
        self.assertEqual(self.source.read_bytes(),self.new);self.assertEqual(c.calls.count('start'),2)
    def test_configuration_change_refused_without_old_version_restore(self):
        c=Controller();c.changed=True
        with self.assertRaises(m.Refused):a.apply(m,self.plan(),c)
        self.assertEqual(self.source.read_bytes(),self.new)

if __name__=='__main__':unittest.main()
