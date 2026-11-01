"""Actual private fixture files; simulated Root/systemd/journal, never service control."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

path=Path(__file__).with_name('netaigis-watchdog-activate.py')
spec=importlib.util.spec_from_file_location('independent_watchdog_activation',path)
activation=importlib.util.module_from_spec(spec);spec.loader.exec_module(activation)


class ActivationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=os.environ['CLINE_DATA_DIR'])
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.assets={name:path.with_name(name).read_bytes()for name in activation.ASSETS}
        self.targets={name:self.root/name for name in activation.ASSETS}
        self.events=[]
        self.observation={'version':1,'component':'netaigis-watchdog','observations':[
            {'unit':unit,'state':'healthy'}for unit in activation.MONITORED]}
        self.service_state={'ActiveState':'inactive','SubState':'dead','ExecMainStatus':'0','InvocationID':'a'*32}
        self.timer_state={'ActiveState':'inactive','UnitFileState':'disabled'}
        self.monitored={'ActiveState':'active','SubState':'running','MainPID':'42','InvocationID':'b'*32}
        patches=[mock.patch.object(activation,'TARGETS',self.targets),
                 mock.patch.object(activation,'RECORD_DIR',self.root),
                 mock.patch.object(activation,'check_targets',side_effect=[list(self.targets),[]]),
                 mock.patch.object(activation,'query',side_effect=self.query),
                 mock.patch.object(activation,'control',side_effect=self.control),
                 mock.patch.object(activation,'read_probe',side_effect=self.probe)]
        self.mocks=[p.start()for p in patches]
        self.addCleanup(mock.patch.stopall)

    def query(self,unit):
        if unit==activation.WATCHDOG:return self.service_state.copy()
        if unit==activation.TIMER:return self.timer_state.copy()
        return self.monitored.copy()

    def control(self,action,unit=None):
        self.events.append((action,unit))
        if action=='start':
            self.assertTrue(all(file.read_bytes()==self.assets[name]for name,file in self.targets.items()))
        if action=='enable':self.timer_state.update(ActiveState='active',UnitFileState='enabled')

    def probe(self,invocation):
        self.events.append('probe')
        return self.observation

    def test_missing_explicit_approval_cannot_write_or_query(self):
        with self.assertRaisesRegex(activation.Refused,'separate_watchdog_installation_approval'):
            activation.apply(self.assets)
        self.mocks[2].assert_not_called()
        self.assertEqual(list(self.root.iterdir()),[])

    def test_asset_drift_cannot_be_published(self):
        self.assets['netaigis-watchdog.py']+=b'\n# drift\n'
        with self.assertRaisesRegex(activation.Refused,'reviewed_watchdog_assets_changed'):
            activation.apply(self.assets,True)
        self.mocks[2].assert_not_called()

    def test_publishes_all_files_before_probe_then_enables_only_the_own_timer(self):
        result=activation.apply(self.assets,True)
        self.assertTrue(result['ok'])
        self.assertLess(self.events.index('probe'),self.events.index(('enable',activation.TIMER)))
        self.assertEqual([event for event in self.events if isinstance(event,tuple)],
                         [('daemon-reload',None),('start',activation.WATCHDOG),('enable',activation.TIMER)])
        for name,target in self.targets.items():
            self.assertEqual(target.read_bytes(),self.assets[name])
            self.assertEqual(target.stat().st_mode&0o777,0o644)

    def test_missing_structured_probe_cannot_enable_timer_or_remove_new_evidence(self):
        self.mocks[5].side_effect=activation.Refused('structured_watchdog_observation_missing')
        with self.assertRaisesRegex(activation.Refused,'structured_watchdog_observation_missing'):
            activation.apply(self.assets,True)
        self.assertNotIn(('enable',activation.TIMER),self.events)
        self.assertTrue(all(file.exists()for file in self.targets.values()))
        journal=next(self.root.glob('watchdog-activation-*.jsonl'))
        self.assertEqual(json.loads(journal.read_text().splitlines()[-1])['stage'],'repair_required')

    def test_real_unhealthy_observation_is_not_relabelled_healthy_or_treated_as_a_crashed_observer(self):
        self.observation['observations'][0]['state']='unhealthy'
        self.service_state['ExecMainStatus']='1'
        result=activation.apply(self.assets,True)
        self.assertTrue(result['ok'])
        self.assertEqual(result['probe_states'][activation.MONITORED[0]],'unhealthy')

    def test_unknown_process_completion_cannot_become_a_successful_installation(self):
        self.service_state.update(ActiveState='active',ExecMainStatus='0')
        with self.assertRaisesRegex(activation.Refused,'watchdog_process_completion_unconfirmed'):
            activation.apply(self.assets,True)
        self.assertNotIn(('enable',activation.TIMER),self.events)

class ScopeAndPublicationTests(unittest.TestCase):
    def test_timer_enable_cannot_replace_an_unrelated_existing_link(self):
        with tempfile.TemporaryDirectory(dir=os.environ['CLINE_DATA_DIR'])as root:
            link=Path(root)/'netaigis-watchdog.timer'
            link.symlink_to(Path(root)/'unrelated.timer')
            with mock.patch.object(activation,'TIMER_LINK',link):
                with self.assertRaisesRegex(activation.Refused,'watchdog_timer_enable_link_collision'):
                    activation.check_timer_link()
            self.assertEqual(os.readlink(link),str(Path(root)/'unrelated.timer'))

    def test_an_unreviewed_existing_file_is_not_replaced(self):
        with tempfile.TemporaryDirectory(dir=os.environ['CLINE_DATA_DIR'])as root:
            targets={name:Path(root)/name for name in activation.ASSETS}
            first=next(iter(targets.values()));first.write_bytes(b'existing-user-content')
            assets={name:path.with_name(name).read_bytes()for name in activation.ASSETS}
            with mock.patch.object(activation,'TARGETS',targets),mock.patch.object(activation,'query')as query:
                with self.assertRaisesRegex(activation.Refused,'unreviewed_watchdog_target_exists'):
                    activation.check_targets(assets)
                query.assert_not_called()
            self.assertEqual(first.read_bytes(),b'existing-user-content')

    def test_a_different_or_incomplete_journal_cannot_confirm_the_service_probe(self):
        with mock.patch.object(activation.subprocess,'run')as run:
            run.return_value.stdout=json.dumps({'version':1,'component':'netaigis-watchdog','observations':[]})
            with self.assertRaisesRegex(activation.Refused,'watchdog_observation_incomplete'):
                activation.read_probe('a'*32)
            run.return_value.stdout=json.dumps({'version':1,'component':'other-process','observations':[]})
            with self.assertRaisesRegex(activation.Refused,'structured_watchdog_observation_missing'):
                activation.read_probe('a'*32)

    def test_service_control_rejects_all_model_and_agent_actions(self):
        with mock.patch.object(activation.subprocess,'run')as run:
            for unit in activation.MONITORED:
                for action in ['start','stop','restart','enable']:
                    with self.assertRaisesRegex(activation.Refused,'only_watchdog_control_allowed'):
                        activation.control(action,unit)
            run.assert_not_called()

    def test_publication_never_overwrites_existing_files(self):
        with tempfile.TemporaryDirectory(dir=os.environ['CLINE_DATA_DIR'])as root:
            file=Path(root)/'watchdog.py';file.write_bytes(b'user-content')
            with self.assertRaises(FileExistsError):activation.publish(file,b'new-content')
            self.assertEqual(file.read_bytes(),b'user-content')
            self.assertEqual([p.name for p in Path(root).iterdir()],['watchdog.py'])


if __name__=='__main__':unittest.main(verbosity=2)
