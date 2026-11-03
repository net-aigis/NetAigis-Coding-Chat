"""Pinned source-only repair: preserve the stable leading instruction prefix.

No service, network, storage or model operations. Learning context remains a
system message before conversation history; original messages are never removed.
"""
import hashlib

EXPECTED = "ca9817079d3081eff10b4020cd44b298259963321522d449eb77c0d4073d6201"
OLD = '''        if learning_context:
            payload["messages"] = [
                {"role": "system", "content": learning_context},
                *messages,
            ]
'''
NEW = '''        if learning_context:
            # CODING_STABLE_LEARNING_PREFIX_V1
            # Keep stable system instructions ahead of the changing learned context.
            # All learned constraints remain system instructions before the history.
            prefix_end = 0
            while (
                prefix_end < len(messages)
                and isinstance(messages[prefix_end], dict)
                and messages[prefix_end].get("role") in ("system", "developer")
            ):
                prefix_end += 1
            payload["messages"] = [
                *messages[:prefix_end],
                {"role": "system", "content": learning_context},
                *messages[prefix_end:],
            ]
'''


def rewrite(source, expected=EXPECTED):
    if hashlib.sha256(source).hexdigest() != expected:
        raise ValueError("Reviewed Coding-Agent source changed")
    text = source.decode("utf-8")
    if "CODING_STABLE_LEARNING_PREFIX_V1" in text or text.count(OLD) != 1:
        raise ValueError("Exact learning-context insertion required")
    result = text.replace(OLD, NEW, 1)
    if result.replace(NEW, OLD, 1) != text:
        raise ValueError("Unrelated source changed")
    compile(result, "reviewed-coding-prefix-cache", "exec")
    return result.encode("utf-8")
