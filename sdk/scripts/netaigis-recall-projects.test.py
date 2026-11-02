"""Real existing SQLite method over fixture data; static API dependency checks.

No FastAPI installation is assumed. These are not productive HTTP acceptance.
"""
import ast
from contextlib import contextmanager
import importlib.util
from pathlib import Path
import sqlite3
import unittest

path = Path(__file__).with_name('netaigis-recall-projects.py')
spec = importlib.util.spec_from_file_location('existing_recall_project_discovery', path)
candidate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(candidate)

STORE = '''class RecallStore:
    def _connect(self): pass
    def events(self): pass
    def conversations(self): pass
    def append(self): pass
'''
API = '''def authorize(): pass
def store(): pass
@router.get("/conversations")
def list_conversations(project_id: str, _actor: str | None = Depends(authorize)): pass
'''


class ExistingRecallProjectTests(unittest.TestCase):
    def existing_store(self, db):
        _, source = candidate.rewrite(API, STORE)
        namespace = {}
        exec(compile(source, 'fixture-existing-store', 'exec'), namespace)
        @contextmanager
        def connect(_self):
            yield db
        namespace['RecallStore']._connect = connect
        return namespace['RecallStore']()

    def test_projects_are_existing_exact_ids_shared_across_authors_without_global_fallback(self):
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.execute('CREATE TABLE events(project_id TEXT,conversation_id TEXT,actor_id TEXT,seq INTEGER)')
        db.executemany('INSERT INTO events VALUES (?,?,?,?)', [
            ('NetAigisOS', 'one', 'Friseer', 1), ('NetAigisOS', 'one', 'jimmi', 2),
            ('OtherProject', 'two', 'jimmi', 3), ('OtherProject', 'three', 'Friseer', 4)])
        self.assertEqual(self.existing_store(db).projects(), [
            ('NetAigisOS', 2, 1, 2), ('OtherProject', 2, 2, 4)])
        self.assertEqual(db.execute('SELECT COUNT(*) FROM events').fetchone()[0], 4)

    def test_empty_store_returns_no_invented_project(self):
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.execute('CREATE TABLE events(project_id TEXT,conversation_id TEXT,seq INTEGER)')
        self.assertEqual(self.existing_store(db).projects(), [])

    def test_existing_module_bytes_are_retained_and_new_route_uses_existing_authentication(self):
        api, store = candidate.rewrite(API, STORE)
        self.assertTrue(api.startswith(API))
        self.assertTrue(store.startswith(STORE))
        fn = next(n for n in ast.parse(api).body if isinstance(n, ast.FunctionDef) and n.name == 'list_projects')
        self.assertEqual(ast.unparse(fn.args.defaults[0]), 'Depends(authorize)')
        self.assertEqual(ast.unparse(fn.decorator_list[0]), "router.get('/projects')")
        self.assertNotIn('project_id', [n.arg for n in fn.args.args])

    def test_refuses_duplicate_route_changed_auth_or_unexpected_store_structure(self):
        for api, store in [(API + candidate.API_ROUTE, STORE),
                           (API, STORE + candidate.STORE_METHOD),
                           (API.replace('Depends(authorize)', 'None'), STORE),
                           (API, STORE + '\nunknown = True\n')]:
            with self.assertRaises(ValueError):
                candidate.rewrite(api, store)


if __name__ == '__main__':
    unittest.main(verbosity=2)
