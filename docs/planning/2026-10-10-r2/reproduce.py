"""Read-only defect witnesses, not regression tests of desired behavior.

Run from the repository root. All service calls are mocks; SQLite is in memory.
The assertions deliberately confirm current defects so evidence is reproducible.
"""
import logging
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests/voice"))
from voice import commands
from voice import queue as queue_module
from senaite.client import SenaiteClient
from test_silent_transcription import load_listener
import numpy as np


class DefectWitnesses(unittest.TestCase):
    def setUp(self):
        self.context = commands.SessionContext()
        self.context.set_sample("SYNTH-A", "uid-a")
        self.patcher = patch.object(commands, "session", self.context)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.client = Mock(spec=SenaiteClient)

    def test_01_result_failure_announced_as_recorded(self):
        self.client.record_result.return_value = {"success": False, "error": "rejected"}
        response = commands.execute_command("record_result", ("7", "pH"), self.client)
        self.assertEqual(response, "Result 7 recorded for pH on sample SYNTH-A.")
        self.client.record_result.assert_called_once_with("SYNTH-A", "pH", "7")

    def test_02_transition_failure_announced_complete_and_context_erased(self):
        self.client.transition_sample.return_value = {"success": False, "error": "rejected"}
        response = commands.execute_command("mark_complete", (), self.client)
        self.assertEqual(response, "Sample SYNTH-A marked complete and submitted for review.")
        self.assertIsNone(self.context.current_sample_id)
        self.client.transition_sample.assert_called_once_with("SYNTH-A", "submit")

    def test_03_pending_list_silently_truncated(self):
        client = SenaiteClient("https://example.invalid", "fixture", "fixture")
        records = [{"getId": f"SYNTH-{n:03d}"} for n in range(30)]
        def page(endpoint):
            limit = int(parse_qs(urlparse(endpoint).query)["limit"][0])
            return {"items": records[:limit], "total": len(records)}
        with patch.object(client, "get", side_effect=page) as get:
            response = commands.execute_command("show_pending", (), client)
        self.assertTrue(response.startswith("25 pending samples."), response)
        self.assertEqual(get.call_count, 1)

    def test_04_offline_command_replays_against_changed_sample(self):
        listener = load_listener()
        listener.SenaiteClient.return_value = self.client
        self.client.ping.return_value = False
        listener.WAKE_WORDS = ("hey lims",)
        listener.parse_command = commands.parse_command
        listener.execute_command = commands.execute_command
        listener.record_until_silence = Mock(side_effect=[np.ones(16000), KeyboardInterrupt()])
        listener.transcribe = Mock(return_value="hey lims record result 7 for pH")
        listener.main()
        q = listener.CommandQueue.return_value
        q.enqueue.assert_called_once_with("record_result", ("7", "pH"))
        replay = q.start_drain_loop.call_args.kwargs["execute_fn"]
        self.context.set_sample("SYNTH-B", "uid-b")
        replay(*q.enqueue.call_args.args)
        self.client.record_result.assert_called_once_with("SYNTH-B", "pH", "7")

    def drain_once(self, command, args, execute):
        q = queue_module.CommandQueue(":memory:")
        q.enqueue(command, args)
        messages = []
        finished = threading.Event()
        def speak(message):
            messages.append(message)
            if message == "All queued commands have been processed.":
                q._stop_event.set()
                finished.set()
        try:
            with patch.object(queue_module, "RETRY_INTERVAL", 0.001):
                q.start_drain_loop(execute, lambda: True, speak)
                self.assertTrue(finished.wait(2), "drain did not complete")
                q.stop_drain_loop()
            return q.count(), messages
        finally:
            q.close()

    def test_05_failed_command_deleted_as_success(self):
        self.context.clear()
        count, messages = self.drain_once(
            "record_result", ("7", "pH"),
            lambda name, args: commands.execute_command(name, args, self.client),
        )
        self.assertEqual(count, 0)
        self.assertIn("All queued commands have been processed.", messages)
        self.client.record_result.assert_not_called()

    def test_06_queued_read_result_never_spoken(self):
        self.client.get_pending_samples.return_value = [{"getId": "SYNTH-A"}]
        count, messages = self.drain_once(
            "show_pending", (),
            lambda name, args: commands.execute_command(name, args, self.client),
        )
        self.assertEqual(count, 0)
        self.client.get_pending_samples.assert_called_once()
        self.assertFalse(any("SYNTH-A" in message for message in messages))
        self.assertIn("All queued commands have been processed.", messages)


if __name__ == "__main__":
    logging.disable(logging.CRITICAL)
    unittest.main(verbosity=2)
