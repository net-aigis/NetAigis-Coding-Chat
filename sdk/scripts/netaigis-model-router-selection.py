"""Pinned guard against silently executing another model than the requested one.

Preparation only. Existing role aliases/defaults remain valid; an unregistered
model must fail before context allocation, history I/O or backend inference.
"""
import ast
import hashlib

EXPECTED = "f7c9a3e84b69928088383a2646213e4fe62b31ba4b8da7a2f42a2ce3a0cbdd66"
NATIVE_OLD = """        alias = payload.get('model')
        is_coding = alias in ('coding', CONFIG['coding']['model'])
        scope = 'coding' if is_coding else 'learning'
"""
NATIVE_NEW = '''        scope = _netaigis_requested_model(payload, "learning")
'''
HELPER = '''def _netaigis_requested_model(payload, default_scope):
    # NETAIGIS_EXPLICIT_MODEL_SELECTION_V1
    requested = payload.get("model")
    if requested is None:
        return default_scope
    if not isinstance(requested, str) or not requested:
        raise ValueError("invalid_requested_model")
    if requested in ("coding", CONFIG["coding"]["model"]):
        return "coding"
    if default_scope == "learning" and requested in ("learning", CONFIG["learning"]["model"]):
        return "learning"
    raise ValueError("requested_model_not_available")


'''


def rewrite(source, expected=EXPECTED):
    if hashlib.sha256(source).hexdigest() != expected:
        raise ValueError("Reviewed model router source changed")
    text = source.decode("utf-8")
    if "NETAIGIS_EXPLICIT_MODEL_SELECTION_V1" in text or text.count(NATIVE_OLD) != 1:
        raise ValueError("Exact native model-selection anchor required")
    tree = ast.parse(text)
    anchors = {}
    for name in ("context_capacity", "do_openai_chat"):
        nodes = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == name]
        if len(nodes) != 1:
            raise ValueError("Exact model-selection function required")
        anchors[name] = nodes[0]
    lines = text.splitlines(keepends=True)
    first = anchors["do_openai_chat"].body[0]
    indent = " " * first.col_offset
    edits = [(sum(len(x) for x in lines[:first.lineno - 1]), indent + '_netaigis_requested_model(payload, "coding")\n'),
             (sum(len(x) for x in lines[:anchors["context_capacity"].lineno - 1]), HELPER)]
    # String offsets are characters; AST line numbers remain valid with UTF-8 comments.
    for offset, addition in sorted(edits, reverse=True):
        text = text[:offset] + addition + text[offset:]
    text = text.replace(NATIVE_OLD, NATIVE_NEW, 1)
    reverted = text.replace(NATIVE_NEW, NATIVE_OLD, 1).replace(HELPER, "", 1)
    reverted = reverted.replace(indent + '_netaigis_requested_model(payload, "coding")\n', "", 1)
    if reverted.encode("utf-8") != source:
        raise ValueError("Unrelated router source changed")
    compile(text, "reviewed-explicit-model-selection", "exec")
    return text.encode("utf-8")
