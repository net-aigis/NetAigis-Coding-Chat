"""Add project discovery to the existing Recall API/store without replacing either.

Pure candidate builder. No file writes, service operations or configuration.
Deployment requires separate current-state backup and operator authorization.
"""
import ast

STORE_METHOD = '''

    def projects(self):
        with self._connect() as db:
            return db.execute("""SELECT project_id, COUNT(*),
                                 COUNT(DISTINCT conversation_id), MAX(seq)
                                 FROM events GROUP BY project_id
                                 ORDER BY project_id""").fetchall()
'''

API_ROUTE = '''

@router.get("/projects")
def list_projects(_actor: str | None = Depends(authorize)):
    return {"projects": [dict(project_id=p, event_count=n,
                              conversation_count=c, last_seq=s)
                         for p,n,c,s in store().projects()]}
'''


def rewrite(api_source, store_source):
    """Append only after checking existing storage and authentication ownership."""
    api = ast.parse(api_source)
    store = ast.parse(store_source)
    classes = [node for node in store.body if isinstance(node, ast.ClassDef) and node.name == 'RecallStore']
    if len(classes) != 1 or store.body[-1] is not classes[0]:
        raise ValueError('recall_store_class_anchor_changed')
    existing = {node.name for node in classes[0].body if isinstance(node, ast.FunctionDef)}
    if not {'_connect', 'events', 'conversations', 'append'}.issubset(existing):
        raise ValueError('recall_store_contract_changed')
    functions = {node.name: node for node in api.body if isinstance(node, ast.FunctionDef)}
    if not {'authorize', 'store', 'list_conversations'}.issubset(functions):
        raise ValueError('recall_api_contract_changed')
    if 'projects' in existing or 'list_projects' in functions:
        raise ValueError('project_discovery_already_present')
    # The new endpoint uses exactly the existing personal/legacy authentication
    # dependency. Never infer a new token or replace author checks on writes.
    if 'Depends(authorize)' not in ast.unparse(functions['list_conversations']):
        raise ValueError('existing_recall_authentication_changed')
    for node in ast.walk(api):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and node.func.attr in ('get', 'post', 'put', 'delete', 'patch')
                and node.args and isinstance(node.args[0], ast.Constant)
                and node.args[0].value == '/projects'):
            raise ValueError('project_route_collision')
    changed_api = api_source + API_ROUTE + '\n'
    changed_store = store_source + STORE_METHOD + '\n'
    compile(changed_api, 'existing-recall-api-project-discovery', 'exec')
    compile(changed_store, 'existing-recall-store-project-discovery', 'exec')
    return changed_api, changed_store
