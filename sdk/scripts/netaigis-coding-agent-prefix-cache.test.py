"""Regression at the real insertion block, without HTTP, inference or writes."""
import ast
import hashlib
import importlib.util
import json
from pathlib import Path
import textwrap
import unittest

spec = importlib.util.spec_from_file_location("prefix_patch", Path(__file__).with_name("netaigis-coding-agent-prefix-cache.py"))
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)
SOURCE = ("import json\nasync def proxy():\n" + patch.OLD + '            body = json.dumps(payload).encode()\n').encode()
HASH = hashlib.sha256(SOURCE).hexdigest()


def insert(block, messages, context):
    payload = {"model": "replaceable-model", "messages": messages, "tools": [{"name": "existing-tool"}]}
    ns = {"messages": messages, "learning_context": context, "payload": payload}
    exec(compile(textwrap.dedent(block), "real-learning-insertion", "exec"), ns)
    return payload


def prefix_size(a, b):
    a, b = json.dumps(a, ensure_ascii=False), json.dumps(b, ensure_ascii=False)
    return next((i for i, (x, y) in enumerate(zip(a, b)) if x != y), min(len(a), len(b)))


class PrefixCache(unittest.TestCase):
    def test_reproduces_variable_prefix_then_keeps_stable_instructions(self):
        messages = [{"role": "system", "content": "Stable tools and instructions. " * 300}, {"role": "user", "content": "Original task"}]
        old_a = insert(patch.OLD, messages, "Accepted A")["messages"]
        old_b = insert(patch.OLD, messages, "Accepted B")["messages"]
        new_a = insert(patch.NEW, messages, "Accepted A")["messages"]
        new_b = insert(patch.NEW, messages, "Accepted B")["messages"]
        self.assertGreater(prefix_size(new_a, new_b), prefix_size(old_a, old_b) + 8000)
        self.assertIs(new_a[0], messages[0])
        self.assertEqual(new_a[1], {"role": "system", "content": "Accepted A"})
        self.assertIs(new_a[2], messages[1])

    def test_preserves_every_original_role_payload_author_tool_and_order(self):
        messages = [{"role": "system", "content": "Policy"}, {"role": "developer", "content": "Tools"},
                    {"role": "user", "content": [{"type": "image_url", "image_url": {"url": "data:image/png;base64,AA=="}}], "author": "Friseer"},
                    {"role": "assistant", "tool_calls": [{"id": "tool1", "function": {"name": "read"}}]},
                    {"role": "tool", "tool_call_id": "tool1", "content": "actual result"},
                    {"role": "user", "content": "Correction", "author": "jimmi"}]
        before = json.dumps(messages)
        payload = insert(patch.NEW, messages, "All accepted constraints")
        result = payload["messages"]
        self.assertEqual(result[2], {"role": "system", "content": "All accepted constraints"})
        self.assertEqual(result[:2] + result[3:], messages)
        self.assertTrue(all(a is b for a, b in zip(result[:2] + result[3:], messages)))
        self.assertEqual(json.dumps(messages), before)
        self.assertEqual(payload["model"], "replaceable-model")
        self.assertEqual(payload["tools"], [{"name": "existing-tool"}])

    def test_no_leading_instructions_keeps_previous_behavior_and_empty_context_is_noop(self):
        for messages in [[], [{"role": "user", "content": "task"}]]:
            self.assertEqual(insert(patch.NEW, messages, "Rules"), insert(patch.OLD, messages, "Rules"))
            self.assertIs(insert(patch.NEW, messages, "")["messages"], messages)

    def test_does_not_move_later_system_messages_or_interleave_tool_pairs(self):
        messages = [{"role": "system", "content": "Policy"}, {"role": "user", "content": "Task"}, {"role": "system", "content": "Later instruction"}]
        result = insert(patch.NEW, messages, "Learning")["messages"]
        self.assertEqual(result[2:], messages[1:])

    def test_exact_source_pin_and_only_one_reviewed_block_changes(self):
        result = patch.rewrite(SOURCE, HASH)
        self.assertEqual(result.decode().replace(patch.NEW, patch.OLD), SOURCE.decode())
        ast.parse(result)
        for source in [SOURCE + b"\n", result]:
            with self.assertRaises(ValueError): patch.rewrite(source, HASH)
        with self.assertRaises(ValueError): patch.rewrite(SOURCE.replace(patch.OLD.encode(), b"        pass\n"), HASH)


if __name__ == "__main__": unittest.main()
