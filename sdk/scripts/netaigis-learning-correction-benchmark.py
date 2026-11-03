"""Three explicitly invoked synthetic classifier inferences; never save learning.

Uses only the existing Learning model alias/router, exact current classifier and
candidate supplied on stdin. No canonical session, Recall API or write functions.
Default invocation refuses inference; --run-nonpersistent-comparison is required.
"""
import argparse
import ast
import asyncio
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlsplit

import httpx

EXPECTED = "b68af9d9954b616b47d127f8d3e62d93ae86ad5d6ffcc58df7eae9a8490de7dd"
METRICS = 'http://127.0.0.1:11442/metrics'


def states():
    result={}
    for unit in ['netaigis-coding-agent.service','ai-agent.service','ai-model-router.service','ai-deepseek.service']:
        raw=subprocess.check_output(['systemctl','show',unit,'-p','MainPID','-p','InvocationID','-p','ActiveState','-p','SubState'],text=True,timeout=5)
        result[unit]=dict(l.split('=',1)for l in raw.splitlines()if '='in l)
    return result


async def main(candidate):
    original=Path('/opt/ai-agent/app.py').read_bytes()
    assert hashlib.sha256(original).hexdigest()==EXPECTED
    rows=[];before=states()
    async with httpx.AsyncClient(timeout=240,trust_env=False,follow_redirects=False)as client:
        health=(await client.get('http://127.0.0.1:11435/health')).json()
        base=health['ollama'].rstrip('/');url=urlsplit(base)
        assert url.scheme=='http'and url.hostname in ['127.0.0.1','::1','localhost']and url.port==11441
        assert not url.username and not url.password and not url.query and not url.fragment and not url.path
        model=health['model'];assert isinstance(model,str)and model
        async def run(source,label,args):
            observation=(await client.get(METRICS)).json()
            assert observation['live']['state']=='idle'and not observation['live']['queued'],'Existing inference active; no comparison sent'
            calls=[]
            async def ollama(messages,**kwargs):
                assert not calls,'One inference per case only'
                started=time.monotonic()
                response=await client.post(base+'/api/chat',json={'model':model,'messages':messages,'stream':False,
                    'options':{'num_ctx':32768,'num_predict':512,'temperature':0}})
                response.raise_for_status();native=response.json()
                calls.append({'elapsedSeconds':round(time.monotonic()-started,3),'promptTokens':native.get('prompt_eval_count'),
                              'outputTokens':native.get('eval_count'),'finish':native.get('done_reason')})
                return native['message']['content']
            tree=ast.parse(source)
            nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))and n.name in ['detect_correction','parse_json_object']]
            assert len(nodes)==2
            ns={'json':json,'ollama_chat':ollama}
            exec(compile(ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[])),'isolated-real-classifier','exec'),ns)
            answer=await ns['detect_correction'](*args)
            assert isinstance(answer,dict)
            row={'label':label,**calls[0],'isCorrection':answer.get('is_correction'),'confidence':answer.get('confidence'),'fieldCount':len(answer)}
            rows.append(row);print(json.dumps({'case':row}),flush=True)
            assert row['finish']=='stop','Comparison truncated; never repeat automatically'
            return answer
        negative=('Nenne einen Vorteil lokaler Verarbeitung.','Die Daten müssen nicht an einen Cloud-Dienst übertragen werden.','Nenne nun einen Nachteil lokaler Verarbeitung.')
        old=await run(original,'original-negative',negative)
        assert old.get('is_correction')is False
        new=await run(candidate,'candidate-negative',negative)
        assert new.get('is_correction')is False
        positive=('Erstelle ausschließlich eine JSON-Ausgabe ohne Markdown.','Hier ist die Ausgabe: ```json {"ok":true} ```',
                  'Das ist falsch: Ich habe ausdrücklich JSON ohne Markdown verlangt. Entferne die Codezäune und gib ausschließlich das JSON-Objekt aus.')
        detected=await run(candidate,'candidate-positive',positive)
        assert detected.get('is_correction')is True and float(detected.get('confidence',0))>=0.8
        assert all(key in detected for key in ['general_rule','applies_when','exceptions','must_do','must_not_do','required_literals','forbidden_literals','ideal_assistant_answer'])
    assert states()==before,'Service/model changed during comparison'
    report={'ok':True,'realClassifierInferences':3,'canonicalTurnsSent':0,'learningWriteFunctionsCalled':0,'recallRequests':0,
            'sourceModified':False,'servicesUnchanged':True,'cases':rows,'scope':'synthetic bounded comparison, not full semantic/regression acceptance'}
    print(json.dumps(report),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--run-nonpersistent-comparison',action='store_true');options=parser.parse_args()
    if not options.run_nonpersistent_comparison:raise SystemExit('Explicit live comparison flag required; no inference sent')
    candidate=base64.b64decode(json.load(sys.stdin)['candidate'],validate=True)
    asyncio.run(main(candidate))
