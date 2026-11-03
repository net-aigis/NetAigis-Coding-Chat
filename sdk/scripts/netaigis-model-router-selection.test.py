"""No network/service/model operations; reproduce silent substitution first."""
import hashlib
import ast
import copy
import json
import os
import threading
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('selection_patch',Path(__file__).with_name('netaigis-model-router-selection.py'))
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
SOURCE=('''CONFIG={'coding':{'model':'active-coder'},'learning':{'model':'active-learner'}}
effects=[]
def context_capacity():
    return 32768
class Handler:
    def do_openai_chat(self, payload):
        effects.append('history')
        payload['model']=CONFIG['coding']['model']
        effects.append('inference')
        return payload['model']
    def do_ollama_chat(self, payload):
'''+a.NATIVE_OLD+'''        effects.append('inference')
        return CONFIG[scope]['model']
''').encode()
HASH=hashlib.sha256(SOURCE).hexdigest()

def load(source):
    ns={};exec(compile(source,'fixture-router','exec'),ns);return ns

class Selection(unittest.TestCase):
    def test_unknown_requested_model_was_silently_replaced_but_now_rejected_before_side_effects(self):
        old=load(SOURCE)
        self.assertEqual(old['Handler']().do_openai_chat({'model':'other-installed-model'}),'active-coder')
        self.assertEqual(old['Handler']().do_ollama_chat({'model':'other-installed-model'}),'active-learner')
        new=load(a.rewrite(SOURCE,HASH))
        for method in ['do_openai_chat','do_ollama_chat']:
            payload={'model':'other-installed-model','messages':[{'role':'user','content':'retain original task'}]}
            original=repr(payload)
            with self.assertRaisesRegex(ValueError,'requested_model_not_available'):getattr(new['Handler'](),method)(payload)
            self.assertEqual(repr(payload),original)
            self.assertEqual(new['effects'],[])

    def test_existing_aliases_and_exact_active_models_keep_existing_role_routing(self):
        ns=load(a.rewrite(SOURCE,HASH));handler=ns['Handler']()
        for name in ['coding','active-coder']:
            self.assertEqual(handler.do_openai_chat({'model':name}),'active-coder')
            self.assertEqual(handler.do_ollama_chat({'model':name}),'active-coder')
        for name in ['learning','active-learner']:
            self.assertEqual(handler.do_ollama_chat({'model':name}),'active-learner')
        self.assertEqual(handler.do_openai_chat({}),'active-coder')
        self.assertEqual(handler.do_ollama_chat({}),'active-learner')

    def test_shared_model_identity_preserves_previous_coding_first_behavior(self):
        ns=load(a.rewrite(SOURCE,HASH));ns['CONFIG']['learning']['model']='active-coder'
        self.assertEqual(ns['_netaigis_requested_model']({'model':'active-coder'},'learning'),'coding')

    def test_invalid_model_types_never_trigger_inference_or_history(self):
        ns=load(a.rewrite(SOURCE,HASH))
        for value in [[],{},False,1,'']:
            for method in ['do_openai_chat','do_ollama_chat']:
                with self.assertRaisesRegex(ValueError,'invalid_requested_model'):getattr(ns['Handler'](),method)({'model':value})
        self.assertEqual(ns['effects'],[])

    def test_source_changes_or_duplicate_application_are_refused(self):
        for source in [SOURCE+b'\n',a.rewrite(SOURCE,HASH)]:
            with self.assertRaises(ValueError):a.rewrite(source,HASH)

class ReachedBackend(Exception): pass

def actual_router(source):
    tree=ast.parse(source)
    methods=[node for node in ast.walk(tree) if isinstance(node,ast.FunctionDef) and node.name in ['do_openai_chat','do_ollama_chat']]
    helper=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='_netaigis_requested_model']
    cls=ast.ClassDef(name='Handler',bases=[],keywords=[],body=methods,decorator_list=[])
    module=ast.fix_missing_locations(ast.Module(body=[*helper,cls],type_ignores=[]))
    effects=[]
    def history(sid):effects.append(('history',sid));return []
    def allocate(*args):effects.append(('allocation',args));return 32768
    def fetch(url,path,payload,timeout):
        effects.append(('backend',payload['model']));raise ReachedBackend()
    ns=dict(CONFIG={'coding':{'model':'active-coder','url':'http://fixture.invalid','context':{'tiers':[32768]}},'learning':{'model':'active-learner','url':'http://fixture.invalid','context':{'tiers':[32768]}}},
            _MODEL='active-coder',_MAX=1000000,_LOCK=threading.RLock(),copy=copy,json=json,
            session_load=history,session_path=lambda _:None,combine=lambda a,b:a+b,context_needed=lambda *_:1,
            selected_tier=lambda _:32768,increase_context=allocate,fetch_json=fetch,
            _netaigis_context_policy=lambda _:([32768],1000000),_netaigis_selected_tier=lambda *_:32768)
    exec(compile(module,'actual-private-router-functions','exec'),ns)
    handler=ns['Handler']();handler.headers={}
    return handler,effects

@unittest.skipUnless(os.environ.get('NETAIGIS_ROUTER_SOURCE'),'private actual source supplied only for targeted regression')
class ActualSelection(unittest.TestCase):
    def setUp(self):
        self.source=Path(os.environ['NETAIGIS_ROUTER_SOURCE']).read_bytes()
        self.fixed=a.rewrite(self.source)
    def test_actual_router_reproduces_substitution_then_refuses_before_history_or_allocation(self):
        for method,substitute in [('do_openai_chat','active-coder'),('do_ollama_chat','active-learner')]:
            old,effects=actual_router(self.source)
            payload={'model':'unregistered-installed-model','messages':[{'role':'user','content':'Original task'}]}
            with self.assertRaises(ReachedBackend):getattr(old,method)(copy.deepcopy(payload))
            self.assertIn(('backend',substitute),effects)
            fixed,effects=actual_router(self.fixed)
            before=copy.deepcopy(payload)
            with self.assertRaisesRegex(ValueError,'requested_model_not_available'):getattr(fixed,method)(payload)
            self.assertEqual(payload,before);self.assertEqual(effects,[])
    def test_actual_router_preserves_both_existing_role_aliases_and_explicit_models(self):
        for method,models in [('do_openai_chat',[('coding','active-coder'),('active-coder','active-coder')]),
                              ('do_ollama_chat',[('coding','active-coder'),('learning','active-learner'),('active-coder','active-coder'),('active-learner','active-learner')])]:
            for requested,expected in models:
                fixed,effects=actual_router(self.fixed)
                with self.assertRaises(ReachedBackend):getattr(fixed,method)({'model':requested,'messages':[{'role':'user','content':'Task'}]})
                self.assertIn(('backend',expected),effects)

if __name__=='__main__':unittest.main()
