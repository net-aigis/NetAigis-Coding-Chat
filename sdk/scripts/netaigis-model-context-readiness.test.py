"""Fail promptly on a final, ready backend that contradicts the requested profile."""
import importlib.util
from pathlib import Path
import subprocess
import threading
import unittest
from unittest import mock

path = Path(__file__).with_name("netaigis-model-context.py")
spec = importlib.util.spec_from_file_location("context_readiness", path)
context = importlib.util.module_from_spec(spec)
spec.loader.exec_module(context)


class Readiness(unittest.TestCase):
    def supervisor(self):
        instance = context.Supervisor.__new__(context.Supervisor)
        instance.stopping = threading.Event()
        instance.listener_probe = lambda: False
        instance.process = None
        instance.profile = {"ready_timeout_seconds": 3}
        instance.current = 0
        child = mock.Mock()
        child.poll.return_value = None
        child.wait.side_effect = subprocess.TimeoutExpired("fixture-owned-child", 0.25)
        instance.launch = mock.Mock(return_value=child)
        return instance, child

    def test_ready_but_smaller_capacity_fails_without_polling_until_a_deadline(self):
        instance, child = self.supervisor()
        instance.health_probe = mock.Mock(return_value=32768)
        with mock.patch.object(context.time, "monotonic", side_effect=[0, 0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4]):
            with self.assertRaisesRegex(context.Refused, "backend_reported_smaller_context"):
                instance.start_child(65536)
        instance.health_probe.assert_called_once()
        child.wait.assert_not_called()

    def test_a_ready_different_model_is_not_retried_as_if_it_were_still_loading(self):
        instance, child = self.supervisor()
        instance.health_probe = mock.Mock(side_effect=context.Refused("selected_model_not_confirmed"))
        with mock.patch.object(context.time, "monotonic", side_effect=[0, 0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4]):
            with self.assertRaisesRegex(context.Refused, "selected_model_not_confirmed"):
                instance.start_child(65536)
        instance.health_probe.assert_called_once()
        child.wait.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
