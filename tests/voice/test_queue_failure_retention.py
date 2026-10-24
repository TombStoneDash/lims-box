"""Synthetic SQLite and mock-client coverage for durable replay outcomes."""

import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from voice import commands
from voice.queue import CommandQueue, MAX_RETRY_ATTEMPTS


class CycleEvent:
    """Run three drain cycles synchronously, without sleeps or thread races."""

    def clear(self):
        self.stopped = False
        self.cycles = 0

    def set(self):
        self.stopped = True

    def is_set(self):
        return self.stopped

    def wait(self, timeout):
        self.cycles += 1
        if self.cycles > 3:
            self.set()


class QueueFailureRetentionTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[2])
        self.addCleanup(directory.cleanup)
        self.path = str(Path(directory.name) / "queue.sqlite")
        self.queue = CommandQueue(self.path)
        self.addCleanup(lambda: self.queue.close())
        self.client = Mock(spec=commands.SenaiteClient)
        self.context = commands.SessionContext()
        session_patch = patch.object(commands, "session", self.context)
        session_patch.start()
        self.addCleanup(session_patch.stop)

    def drain(self, executor=None):
        if executor is None:
            executor = Mock(side_effect=lambda name, args: commands.execute_command(
                name, args, self.client
            ))
        spoken = Mock()
        self.queue._stop_event = CycleEvent()

        def thread(**kwargs):
            result = Mock()
            result.start.side_effect = kwargs["target"]
            result.is_alive.return_value = False
            return result

        with patch("voice.queue.threading.Thread", side_effect=thread):
            self.queue.start_drain_loop(executor, lambda: True, spoken)
        return executor, [call.args[0] for call in spoken.call_args_list]

    def rows(self):
        with closing(sqlite3.connect(self.path)) as connection:
            return connection.execute(
                "SELECT cmd_name, args, attempts, last_error FROM pending_commands"
            ).fetchall()

    def reopen(self):
        self.queue.close()
        self.queue = CommandQueue(self.path)

    def assert_held(self, executor, spoken):
        executor.assert_called_once()
        self.assertEqual(self.queue.count(), 1)
        self.assertEqual(self.queue.get_pending(), [])
        self.assertEqual(self.queue.purge_exhausted(), 0)
        self.assertTrue(self.rows()[0][3])
        self.assertNotIn("All queued commands have been processed.", spoken)
        self.assertTrue(any("need attention" in text for text in spoken))

    def test_real_executor_without_current_sample_survives_reopening(self):
        self.queue.enqueue("record_result", ("7", "pH"))
        executor, spoken = self.drain()
        self.assert_held(executor, spoken)
        self.client.record_result.assert_not_called()
        self.assertIn("No current sample", self.rows()[0][3])
        before = self.rows()
        self.reopen()
        replay, spoken = self.drain()
        replay.assert_not_called()
        self.assertEqual(self.rows(), before)
        self.assertNotIn("All queued commands have been processed.", spoken)

    def test_real_executor_refusals_errors_and_unconfirmed_creation(self):
        cases = [
            ("print_label", ("SA-001",), "not found"),
            ("show_pending", (), "Error executing command"),
            ("log_sample", ("SA-001",), "not confirmed"),
            ("start_test", ("pH",), "No workflow change"),
        ]
        self.client.get_sample.return_value = None
        self.client.get_pending_samples.side_effect = RuntimeError("synthetic error")
        self.client.create_sample.return_value = {}
        for name, args, expected in cases:
            with self.subTest(command=name):
                if name == "start_test":
                    self.context.set_sample("SA-001", "uid")
                    self.client.get_sample.return_value = {"uid": "uid"}
                    self.client.get.return_value = {"items": [{"review_state": "received"}]}
                self.queue.enqueue(name, args)
                executor, spoken = self.drain()
                executor.assert_called_once()
                self.assertIn(expected, self.rows()[-1][3])
                self.assertNotIn("All queued commands have been processed.", spoken)
        self.assertEqual(self.queue.count(), len(cases))
        self.client.create_sample.assert_called_once()

    def test_unknown_and_mismatched_responses_are_held(self):
        for response in ("OK", "", None, "No pending samples.",
                         "Result 7 recorded for pH on sample SA-001. But failed."):
            with self.subTest(response=response):
                self.queue.enqueue("record_result", ("7", "pH"))
                executor, spoken = self.drain(Mock(return_value=response))
                executor.assert_called_once()
                self.assertNotIn("All queued commands have been processed.", spoken)
        self.assertEqual(self.queue.count(), 5)
        self.assertEqual(self.queue.get_pending(), [])

    def test_exception_after_possible_write_is_never_retried(self):
        self.queue.enqueue("record_result", ("7", "pH"))
        executor, spoken = self.drain(Mock(side_effect=TimeoutError("lost response")))
        self.assert_held(executor, spoken)
        self.reopen()
        executor, _ = self.drain()
        executor.assert_not_called()

    def test_hold_is_durable_before_executor_is_called(self):
        self.queue.enqueue("print_label", ("SA-001",))

        def execute(*args):
            self.assertIn("unconfirmed", self.rows()[0][3])
            return "Unknown outcome"

        self.assert_held(*self.drain(Mock(side_effect=execute)))

    def test_exhausted_legacy_rows_are_retained(self):
        command_id = self.queue.enqueue("record_result", ("7", "pH"))
        with self.queue.conn:
            self.queue.conn.execute(
                "UPDATE pending_commands SET attempts = ? WHERE id = ?",
                (MAX_RETRY_ATTEMPTS, command_id),
            )
        self.assertEqual(self.queue.purge_exhausted(), 0)
        self.reopen()
        executor, spoken = self.drain()
        executor.assert_not_called()
        self.assertEqual(self.queue.count(), 1)
        self.assertTrue(any("need attention" in text for text in spoken))

    def test_real_successes_complete(self):
        self.context.set_sample("SA-001", "uid")
        self.client.get_sample.return_value = {"uid": "uid", "api_url": "synthetic"}
        self.client.get_pending_samples.return_value = []
        self.client.get.return_value = {"items": [{"parent_uid": "uid", "review_state": "verified"}]}
        # Writes succeed only when SENAITE explicitly acknowledges them.
        self.client.record_result.return_value = {"success": True}
        self.client.post.return_value = {"success": True}
        self.client.transition_sample.return_value = {"success": True, "review_state": "to_be_verified"}
        for name, args in [
            ("log_sample", ("SA-001",)), ("record_result", ("7", "pH")),
            ("print_label", ("SA-001",)), ("show_pending", ()),
            ("start_test", ("pH",)), ("mark_complete", ()),
        ]:
            self.queue.enqueue(name, args)
        executor, spoken = self.drain()
        self.assertEqual(executor.call_count, 6)
        self.assertEqual(self.queue.count(), 0)
        self.assertIn("All queued commands have been processed.", spoken)

    def test_confirmed_submission_leaves_the_queue_in_either_wording(self):
        for answer in ({"success": True, "review_state": "verified"}, {"success": True}):
            with self.subTest(answer=answer):
                self.context.set_sample("SA-001", "uid")
                self.client.transition_sample.return_value = answer
                self.queue.enqueue("mark_complete", ())
                executor, spoken = self.drain()
                executor.assert_called_once()
                self.assertEqual(self.queue.count(), 0)
                self.assertIn("All queued commands have been processed.", spoken)

    def test_unexpected_submission_state_stays_queued(self):
        self.context.set_sample("SA-001", "uid")
        self.client.transition_sample.return_value = {"success": True, "review_state": "sample_received"}
        self.queue.enqueue("mark_complete", ())
        executor, spoken = self.drain()
        self.assert_held(executor, spoken)

    def test_mixed_success_and_failure_never_announces_all_processed(self):
        self.queue.enqueue("record_result", ("7", "pH"))
        self.queue.enqueue("show_pending", ())
        self.client.get_pending_samples.return_value = []
        executor, spoken = self.drain()
        self.assertEqual(executor.call_count, 2)
        self.assertEqual(self.queue.count(), 1)
        self.assertEqual(self.rows()[0][0], "record_result")
        self.assertNotIn("All queued commands have been processed.", spoken)

    def test_confirmed_creation_and_nonempty_pending_list_complete(self):
        self.client.get_sample.return_value = None
        self.client.create_sample.return_value = {"uid": "new-uid"}
        self.client.get_pending_samples.return_value = [{"id": "SA-001"}]
        self.queue.enqueue("log_sample", ("SA-001",))
        self.queue.enqueue("show_pending", ())
        executor, spoken = self.drain()
        self.assertEqual(executor.call_count, 2)
        self.assertEqual(self.queue.count(), 0)
        self.assertIn("All queued commands have been processed.", spoken)


if __name__ == "__main__":
    unittest.main()
