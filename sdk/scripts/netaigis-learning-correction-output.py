"""Pure pinned preparation: negative correction checks need no empty rule fields.

The existing classification criteria, positive correction schema, parser and
candidate-writing paths remain byte-identical. No requests, file or service I/O.
"""
import ast
import hashlib

EXPECTED = "b68af9d9954b616b47d127f8d3e62d93ae86ad5d6ffcc58df7eae9a8490de7dd"
OLD = '''Antworte ausschließlich mit gültigem JSON:

{{
  "is_correction": true,
'''
NEW = '''Wenn KEINE echte Korrektur vorliegt, antworte ausschließlich mit:
{{"is_correction": false, "confidence": 0.0}}
Gib in diesem Fall keine weiteren Felder, Regeltexte oder Erklärungen aus.

Nur bei einer echten Korrektur: Antworte ausschließlich mit gültigem JSON:

{{
  "is_correction": true,
'''


def rewrite(source, expected=EXPECTED):
    if hashlib.sha256(source).hexdigest() != expected:
        raise ValueError("Reviewed Learning-Agent source changed")
    tree = ast.parse(source)
    functions = [n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "detect_correction"]
    if len(functions) != 1:
        raise ValueError("Exact correction classifier required")
    node = functions[0]
    lines = source.decode().splitlines(keepends=True)
    function = "".join(lines[node.lineno - 1:node.end_lineno])
    if function.count(OLD) != 1 or NEW in function:
        raise ValueError("Exact positive correction schema required")
    updated = function.replace(OLD, NEW, 1)
    result = ("".join(lines[:node.lineno - 1]) + updated + "".join(lines[node.end_lineno:])).encode()
    if result.replace(NEW.encode(), OLD.encode(), 1) != source:
        raise ValueError("Unrelated learning source changed")
    compile(result, "reviewed-short-negative-correction", "exec")
    return result
