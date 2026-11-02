"""Real FastAPI ASGI regression against supplied existing-module candidates.

Fixture authentication/SQLite only, no listener, production store or model call.
Run in the existing backend interpreter, with source supplied in memory.
"""
import asyncio
from contextlib import contextmanager
import json
import os
import sqlite3
import sys
import types


async def check(api_source, store_source):
    from fastapi import FastAPI

    os.environ['RECALL_ACTOR_TOKENS_JSON'] = json.dumps({'Friseer': 'fixture-friseer', 'jimmi': 'fixture-jimmi'})
    os.environ['RECALL_API_TOKEN'] = ''
    module = types.ModuleType('recall_store')
    exec(compile(store_source, 'in-memory-recall-store-candidate', 'exec'), module.__dict__)
    sys.modules['recall_store'] = module
    api = types.ModuleType('in_memory_recall_api_candidate')
    sys.modules[api.__name__] = api
    exec(compile(api_source, 'in-memory-recall-api-candidate', 'exec'), api.__dict__)
    db = sqlite3.connect(':memory:', check_same_thread=False)
    try:
        db.execute('''CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT UNIQUE NOT NULL,project_id TEXT NOT NULL,conversation_id TEXT NOT NULL,
                    actor_id TEXT NOT NULL,kind TEXT NOT NULL,payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
        @contextmanager
        def connect():
            yield db
            db.commit()
        store = module.RecallStore.__new__(module.RecallStore)
        store._connect = connect
        api.store = lambda: store
        app = FastAPI()
        app.include_router(api.router)

        async def request(path, token=None, method='GET', body=None):
            messages = []
            raw = json.dumps(body).encode() if body is not None else b''
            headers = [(b'content-type', b'application/json')]
            if token is not None: headers.append((b'authorization', ('Bearer '+token).encode()))
            scope = {'type':'http','asgi':{'version':'3.0'},'http_version':'1.1','method':method,
                     'scheme':'http','path':path,'raw_path':path.encode(),'query_string':b'',
                     'root_path':'','headers':headers,'client':('127.0.0.1',1),'server':('127.0.0.1',80)}
            async def receive():
                return {'type':'http.request','body':raw,'more_body':False}
            async def send(message): messages.append(message)
            await app(scope, receive, send)
            status = next(message['status'] for message in messages if message['type']=='http.response.start')
            payload = json.loads(b''.join(message.get('body', b'') for message in messages if message['type']=='http.response.body'))
            return status, payload

        path = '/internal/recall/projects'
        assert (await request(path))[0] == 401
        assert (await request(path, 'wrong-fixture'))[0] == 401
        assert await request(path, 'fixture-friseer') == (200, {'projects': []})
        for index, (project, actor) in enumerate((('NetAigisOS','Friseer'), ('NetAigisOS','jimmi'), ('OtherProject','jimmi'))):
            store.append(event_id='fixture-'+str(index), project_id=project, conversation_id='same-id',
                         actor_id=actor,kind='fixture',payload={'fixture_only':True})
        before = db.total_changes
        expected = {'projects':[
            {'project_id':'NetAigisOS','event_count':2,'conversation_count':1,'last_seq':2},
            {'project_id':'OtherProject','event_count':1,'conversation_count':1,'last_seq':3}]}
        for actor in ('friseer','jimmi'):
            assert await request(path, 'fixture-'+actor) == (200, expected)
        assert db.total_changes == before
        forged = {'event_id':'forged','project_id':'NetAigisOS','conversation_id':'same-id',
                  'actor_id':'jimmi','kind':'fixture','payload':{}}
        assert (await request('/internal/recall/events','fixture-friseer','POST',forged))[0] == 403
        assert db.total_changes == before
        return {'ok':True,'real_fastapi_asgi':True,'fixture_database':True,'fixture_credentials':True,
                'unauthenticated_and_wrong_token_status':401,'forged_author_status':403,
                'both_personal_actors_same_catalog':True,'empty_store_has_no_invented_project':True,
                'project_read_writes':0,'productive_files_modified':False,'service_modified':False,'model_request':False}
    finally:
        db.close()


if __name__ == '__main__':
    print(json.dumps(asyncio.run(check(BUNDLED_API, BUNDLED_STORE))))
