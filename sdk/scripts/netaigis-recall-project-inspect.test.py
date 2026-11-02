"""Actual WAL-backed SQLite fixtures; no production access or service control."""
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest import mock

path = Path(__file__).with_name('netaigis-recall-project-inspect.py')
spec = importlib.util.spec_from_file_location('recall_project_inspector', path)
inspector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspector)


class ProjectInspectionTests(unittest.TestCase):
    def test_reads_committed_wal_projects_without_reading_payloads_or_mutating_database(self):
        with tempfile.TemporaryDirectory(dir=os.environ['CLINE_DATA_DIR']) as root:
            database = Path(root) / 'recall.sqlite3'
            with sqlite3.connect(database) as writer:
                writer.execute('PRAGMA journal_mode=WAL')
                writer.execute('PRAGMA wal_autocheckpoint=0')
                writer.execute('CREATE TABLE events(project_id TEXT, payload TEXT)')
                writer.executemany('INSERT INTO events VALUES (?,?)',
                                   [('NetAigisOS', 'SECRET-CONTENT'), ('OtherProject', 'OTHER-SECRET')])
                writer.commit()
                before = {p.name: p.read_bytes() for p in (database, Path(str(database) + '-wal'))}
                result = inspector.read_projects(database)
                self.assertEqual(result[0]['projects'], [
                    {'project_id': 'NetAigisOS', 'row_count': 1},
                    {'project_id': 'OtherProject', 'row_count': 1}])
                self.assertNotIn('SECRET', json.dumps(result))
                self.assertEqual(before, {p.name: p.read_bytes() for p in (database, Path(str(database) + '-wal'))})

    def test_missing_database_is_not_created(self):
        with tempfile.TemporaryDirectory(dir=os.environ['CLINE_DATA_DIR']) as root:
            database = Path(root) / 'missing.sqlite3'
            with self.assertRaises(sqlite3.OperationalError):
                inspector.read_projects(database)
            self.assertFalse(database.exists())

    def test_configuration_never_exposes_tokens_or_executes_shell(self):
        with tempfile.TemporaryDirectory(dir=os.environ['CLINE_DATA_DIR']) as root:
            path = Path(root) / 'recall.env'
            path.write_text('RECALL_API_TOKEN=hidden-token\nRECALL_PROJECT_TOKEN=also-hidden\n'
                            'export RECALL_PROJECT_ID="NetAigisOS"\n# comment\n')
            result = inspector.configuration_summary(path)
            self.assertEqual(result['explicit_project_values'], {'RECALL_PROJECT_ID': 'NetAigisOS'})
            self.assertNotIn('hidden', json.dumps(result))

    def test_journal_only_reports_attributed_observations_and_selected_manager_fields(self):
        entries = [{'_SYSTEMD_UNIT': 'other.service', 'MESSAGE': 'private-secret'},
                   {'_SYSTEMD_UNIT': inspector.WATCHDOG, '_SYSTEMD_INVOCATION_ID': 'a' * 32,
                    'MESSAGE': json.dumps({'component': 'netaigis-watchdog', 'version': 1,
                                           'observations': []})}]
        with mock.patch.object(inspector.subprocess, 'run') as run:
            run.return_value.stdout = '\n'.join(json.dumps(row) for row in entries)
            result = inspector.watchdog_receipt()
        self.assertNotIn('private-secret', json.dumps(result))
        self.assertNotIn('observation', result[0])
        self.assertEqual(result[1]['observation']['component'], 'netaigis-watchdog')


if __name__ == '__main__':
    unittest.main(verbosity=2)
