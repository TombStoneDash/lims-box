"""Queued command results reach speech without changing execution bookkeeping."""

import threading
import unittest
from unittest.mock import Mock, patch

from voice import queue as queue_module
from voice.commands import execute_command


class QueueSpokenResultsTests(unittest.TestCase):
    def setUp(self):
        self.queue = queue_module.CommandQueue(":memory:")
        self.addCleanup(self.queue.close)

    def drain(self, execute, speak):
        completed = threading.Event()

        def speak_and_signal(message):
            try:
                speak(message)
            finally:
                if message == "All queued commands have been processed.":
                    completed.set()

        with patch.object(queue_module, "RETRY_INTERVAL", 0.01):
            self.queue.start_drain_loop(execute, lambda: True, speak_and_signal)
            self.assertTrue(completed.wait(2), "queue did not finish draining")
            self.queue.stop_drain_loop()

    def test_queued_show_pending_response_is_spoken_once(self):
        self.queue.enqueue("show_pending", ())
        spoken = []
        executed = []
        client = Mock()
        client.get_pending_samples.return_value = [{"getId": "SYNTH-A"}]

        def execute(name, args):
            executed.append((name, args))
            return execute_command(name, args, client)

        self.drain(execute, spoken.append)

        self.assertEqual(executed, [("show_pending", ())])
        client.get_pending_samples.assert_called_once_with()
        self.assertEqual(spoken.count("1 pending samples. SYNTH-A."), 1)
        self.assertEqual(self.queue.count(), 0)

    def test_multiple_reads_are_spoken_in_queue_order(self):
        with patch.object(queue_module.time, "time", return_value=1234.0):
            self.queue.enqueue("show_pending", ())
            self.queue.enqueue("show_pending", ())
        responses = iter((
            "1 pending samples. SYNTH-A.",
            "2 pending samples. SYNTH-B, SYNTH-C.",
        ))
        spoken = []

        self.drain(lambda name, args: next(responses), spoken.append)

        self.assertEqual(
            [message for message in spoken if "pending samples." in message],
            ["1 pending samples. SYNTH-A.", "2 pending samples. SYNTH-B, SYNTH-C."],
        )
        self.assertEqual(self.queue.count(), 0)

    def test_speech_failures_do_not_retry_action_or_abandon_later_work(self):
        self.queue.enqueue("mark_complete", ("SYNTH-A",))
        self.queue.enqueue("show_pending", ())
        executed = []
        spoken = []

        def execute(name, args):
            executed.append((name, args))
            if name == "mark_complete":
                return "Sample SYNTH-A marked complete."
            return "1 pending samples. SYNTH-B."

        def failing_speech(message):
            spoken.append(message)
            if message != "1 pending samples. SYNTH-B.":
                raise RuntimeError("synthetic TTS failure")

        with self.assertLogs(queue_module.logger, level="ERROR") as captured:
            self.drain(execute, failing_speech)

        self.assertEqual(executed, [("mark_complete", ("SYNTH-A",)), ("show_pending", ())])
        self.assertEqual(spoken.count("Sample SYNTH-A marked complete."), 1)
        self.assertEqual(spoken.count("1 pending samples. SYNTH-B."), 1)
        self.assertEqual(self.queue.count(), 0)
        self.assertEqual(len(captured.records), 3)


if __name__ == "__main__":
    unittest.main()
