"""Classification/output contract regression, no model calls or memory writes."""
import ast
import asyncio
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import types
import unittest

spec=importlib.util.spec_from_file_location('short_correction',Path(__file__).with_name('netaigis-learning-correction-output.py'))
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
SOURCE=('''async def detect_correction(original_user, previous_assistant, current_user, tool_evidence=None):
    prompt=f"""Original: {original_user}\nAnswer: {previous_assistant}\nFollow-up: {current_user}\nEvidence: {tool_evidence}\n'''+a.OLD+'''  "confidence": 0.0,
  "general_rule": ""
}}
"""
    result=await ollama_chat([{"role":"user","content":prompt}])
    return parse_json_object(result)
''').encode()
HASH=hashlib.sha256(SOURCE).hexdigest()


def classifier(source,result):
    prompts=[]
    async def model(messages,**kwargs):prompts.append(messages);return json.dumps(result)
    tree=ast.parse(source);node=next(n for n in tree.body if isinstance(n,ast.AsyncFunctionDef)and n.name=='detect_correction')
    ns={'ollama_chat':model,'parse_json_object':json.loads,'json':json}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[node],type_ignores=[])),'actual-classifier','exec'),ns)
    answer=asyncio.run(ns['detect_correction']('Original task','Previous answer','Follow-up',{'actual_tool_result':True}))
    return answer,prompts


class CorrectionOutput(unittest.TestCase):
    def test_short_false_result_preserves_existing_negative_decision(self):
        value={'is_correction':False,'confidence':0.0}
        for source in [SOURCE,a.rewrite(SOURCE,HASH)]:
            answer,prompts=classifier(source,value)
            self.assertEqual(answer,value);self.assertEqual(len(prompts),1)
        _,prompts=classifier(a.rewrite(SOURCE,HASH),value)
        self.assertIn('keine weiteren Felder',prompts[0][0]['content'])
        self.assertIn('Follow-up',prompts[0][0]['content'])
        self.assertIn('actual_tool_result',prompts[0][0]['content'])

    def test_true_correction_retains_complete_rule_contract(self):
        value={'is_correction':True,'confidence':0.99,'general_rule':'Keep original scope','required_literals':['exact-value'],'must_not_do':['invent results']}
        answer,prompts=classifier(a.rewrite(SOURCE,HASH),value)
        self.assertEqual(answer,value)
        self.assertIn('"is_correction": true',prompts[0][0]['content'])
        self.assertIn('"general_rule"',prompts[0][0]['content'])

    def test_wrong_source_or_repeated_application_is_refused(self):
        for source in [SOURCE+b'\n',a.rewrite(SOURCE,HASH)]:
            with self.assertRaises(ValueError):a.rewrite(source,HASH)


@unittest.skipUnless(os.environ.get('NETAIGIS_LEARNING_SOURCE'),'private actual source only for targeted test')
class ActualCorrectionOutput(unittest.TestCase):
    def setUp(self):
        self.original=Path(os.environ['NETAIGIS_LEARNING_SOURCE']).read_bytes();self.fixed=a.rewrite(self.original)
    def test_actual_positive_schema_and_all_other_functions_unchanged(self):
        self.assertEqual(self.fixed.replace(a.NEW.encode(),a.OLD.encode(),1),self.original)
        value={'is_correction':True,'confidence':0.99,'general_rule':'Do the requested work','ideal_assistant_answer':'Actual evidence required'}
        old,_=classifier(self.original,value);new,prompts=classifier(self.fixed,value)
        self.assertEqual(old,new);self.assertIn('WERKZEUGNACHWEISE',prompts[0][1]['content'])
    def test_actual_receiver_does_not_save_a_short_negative_and_keeps_true_author_project_model(self):
        node=next(n for n in ast.parse(self.fixed).body if isinstance(n,ast.AsyncFunctionDef)and n.name=='netaigis_receive_correction');node.decorator_list=[]
        saved=[];decision={'is_correction':False,'confidence':0.0}
        async def detect(*args,**kwargs):return dict(decision)
        def save(*args):saved.append(args);return {'existing':'candidate-contract'}
        ns=dict(Request=object,DEFAULT_USER='no-default-used',MODEL='no-default-model-used',normalize_project=lambda p:p,
                netaigis_correction_text=lambda s:s or '',should_skip_learning=lambda _:False,
                netaigis_collect_tool_evidence=lambda *_:{'retained':True},detect_correction=detect,CORRECTION_THRESHOLD=0.8,
                netaigis_existing_correction=lambda *_:None,save_learning_candidates=save)
        exec(compile(ast.fix_missing_locations(ast.Module(body=[node],type_ignores=[])),'actual-receiver','exec'),ns)
        data={'user':'jimmi','project':'existing-project','model':'replaceable-model','messages':[{'role':'user','content':'Original'},{'role':'assistant','content':'Earlier'},{'role':'user','content':'Follow-up'}]}
        async def body():return data
        request=types.SimpleNamespace(client=types.SimpleNamespace(host='127.0.0.1'),json=body)
        result=asyncio.run(ns['netaigis_receive_correction'](request));self.assertEqual(result,{'status':'no_correction'});self.assertEqual(saved,[])
        decision.update(is_correction=True,confidence=0.99,general_rule='Confirmed correction')
        result=asyncio.run(ns['netaigis_receive_correction'](request));self.assertEqual(result['status'],'candidate_created')
        self.assertEqual(saved[0][:2],('jimmi','existing-project'));self.assertEqual(saved[0][-1],'replaceable-model')

if __name__=='__main__':unittest.main()
