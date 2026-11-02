"""Real archive/restore fixtures and simulated firewalld; never change host rules."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

path = Path(__file__).with_name('netaigis-chat-firewall.py')
spec = importlib.util.spec_from_file_location('local_https_firewall', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LocalFirewallTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(dir=os.environ['CLINE_DATA_DIR'])
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.states = {'runtime': ['existing-runtime-rule'], 'permanent': ['existing-permanent-rule']}
        self.calls = []

    def firewall(self, *args):
        self.calls.append(args)
        if args == ('--get-zone-of-interface=wlp3s0',): return 'public'
        key = 'permanent' if '--permanent' in args else 'runtime'
        if '--list-rich-rules' in args: return '\n'.join(self.states[key])
        self.assertIn('--zone=public', args)
        self.assertEqual(args[-1], '--add-rich-rule=' + module.RULE)
        self.states[key].append(module.RULE)
        return 'success'

    def prepared(self, parent, before):
        self.assertEqual(before, self.states)
        (self.root / 'manifest.json').write_text(json.dumps({'before': before}))
        return self.root, {'actual_restore_verified': True}

    def test_missing_approval_cannot_query_or_mutate_firewall(self):
        with mock.patch.object(module, 'firewall') as control:
            with self.assertRaisesRegex(ValueError, 'permanent_lan_rule_approval_required'):
                module.apply()
            control.assert_not_called()

    def test_only_exact_lan_rule_is_added_to_both_states_without_reload_or_other_changes(self):
        with mock.patch.object(module, 'firewall', side_effect=self.firewall), \
             mock.patch.object(module, 'prepare_backup', side_effect=self.prepared):
            result = module.apply(True)
        self.assertTrue(result['permanent_and_runtime_confirmed'])
        self.assertEqual(self.states, {'runtime': ['existing-runtime-rule', module.RULE],
                                      'permanent': ['existing-permanent-rule', module.RULE]})
        self.assertEqual(result['rollback_remove_only_from'], ['runtime', 'permanent'])
        self.assertFalse(any('--reload' in args for args in self.calls))
        self.assertEqual(sum(any(arg.startswith('--add-rich-rule=') for arg in args) for args in self.calls), 2)

    def test_already_present_rule_is_never_added_or_backed_up_again(self):
        self.states = {'runtime': [module.RULE], 'permanent': [module.RULE]}
        with mock.patch.object(module, 'firewall', side_effect=self.firewall), \
             mock.patch.object(module, 'prepare_backup') as prepare:
            self.assertFalse(module.apply(True)['firewall_modified'])
            prepare.assert_not_called()

    def test_unverified_backup_or_changed_zone_cannot_add_any_rule(self):
        with mock.patch.object(module, 'firewall', side_effect=self.firewall), \
             mock.patch.object(module, 'prepare_backup', side_effect=ValueError('restore_failed')):
            with self.assertRaisesRegex(ValueError, 'restore_failed'): module.apply(True)
        self.assertFalse(any(any(arg.startswith('--add-rich-rule=') for arg in args) for args in self.calls))
        with mock.patch.object(module, 'firewall', return_value='different-zone'):
            with self.assertRaisesRegex(ValueError, 'wlan_zone_changed'): module.apply(True)

    def test_actual_zone_archive_restore_preserves_bytes_attributes_and_records_absence(self):
        source = self.root / 'public.xml'
        source.write_text('<zone><service name="ssh"/></zone>\n')
        source.chmod(0o640)
        absent = self.root / 'public.xml.old'
        parent = self.root / 'existing-backup-parent'; parent.mkdir(mode=0o700)
        before = source.read_bytes(), module.attributes(source)
        with mock.patch.object(module, 'SOURCES', (source, absent)):
            out, manifest = module.prepare_backup(parent, self.states)
        self.assertTrue(manifest['actual_restore_verified'])
        self.assertEqual(manifest['records'][str(absent)], {'exists': False})
        self.assertFalse(absent.exists())
        self.assertEqual((source.read_bytes(), module.attributes(source)), before)
        self.assertTrue((out / 'zone-files.tar').is_file())

    def test_unrelated_symlink_cannot_enter_privileged_archive(self):
        source = self.root / 'public.xml'
        other = self.root / 'user-file'; other.write_text('keep')
        source.symlink_to(other)
        with mock.patch.object(module, 'SOURCES', (source,)):
            with self.assertRaisesRegex(ValueError, 'zone_source_type_changed'):
                module.prepare_backup(self.root, self.states)
        self.assertEqual(other.read_text(), 'keep')


if __name__ == '__main__':
    unittest.main(verbosity=2)
