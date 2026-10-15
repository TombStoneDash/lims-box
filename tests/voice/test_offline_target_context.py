"""Offline commands must not use a later session's current sample."""

import unittest
from unittest.mock import Mock

import numpy as np

from test_silent_transcription import load_listener


class OfflineTargetContextTests(unittest.TestCase):
    def setUp(self):
        self.reset_listener()

    def reset_listener(self):
        self.listener = load_listener()
        self.client = self.listener.SenaiteClient.return_value
        self.queue = self.listener.CommandQueue.return_value
        self.listener.record_until_silence = Mock(
            side_effect=[np.ones(5000, dtype="float32"), KeyboardInterrupt]
        )
        self.listener.transcribe = Mock(return_value="Hey LIMS command")
        self.listener.contains_wake_word = Mock(return_value="Hey LIMS")
        self.listener.extract_inline_command = Mock(return_value="command")

    def run_one_command(self, command, online=False):
        self.listener.parse_command.return_value = command
        self.client.ping.side_effect = [online, online]
        self.listener.main()
        self.assertTrue(self.queue.close.called)

    def test_offline_session_target_commands_are_refused_with_recovery_instruction(self):
        commands = (
            ("record_result", ("7", "pH")),
            ("start_test", ("pH",)),
            ("mark_complete", ()),
        )
        for command in commands:
            with self.subTest(command=command[0]):
                self.reset_listener()
                self.run_one_command(command)
                self.queue.enqueue.assert_not_called()
                self.queue.count.assert_not_called()
                self.listener.execute_command.assert_not_called()
                feedback = self.listener.speak.call_args_list[-2].args[0]
                self.assertIn("offline", feedback.lower())
                self.assertIn("not queued", feedback.lower())
                self.assertIn("reconnect", feedback.lower())
                self.assertIn("reselect the sample", feedback.lower())

    def test_legacy_replay_cannot_write_to_new_current_sample(self):
        self.run_one_command(("show_pending", ()))
        replay = self.queue.start_drain_loop.call_args.kwargs["execute_fn"]
        current_sample = {"id": "SYNTH-B"}
        writes = []

        def execute(cmd_name, args, client):
            writes.append((cmd_name, args, current_sample["id"]))
            return "executed"

        self.listener.execute_command.side_effect = execute
        for cmd_name, args in (
            ("record_result", ("7", "pH")),
            ("start_test", ("pH",)),
            ("mark_complete", ()),
        ):
            with self.subTest(cmd_name=cmd_name):
                response = replay(cmd_name, args)
                self.assertIn("discarded", response)
                self.assertEqual(writes, [])

    def test_explicit_target_and_read_only_commands_still_queue_and_replay(self):
        for command in (
            ("log_sample", ("SYNTH-A",)),
            ("print_label", ("SYNTH-A",)),
            ("show_pending", ()),
        ):
            with self.subTest(command=command[0]):
                self.reset_listener()
                self.queue.count.return_value = 1
                self.run_one_command(command)
                self.queue.enqueue.assert_called_once_with(*command)
                self.assertIn("Command queued", self.listener.speak.call_args_list[-2].args[0])
                replay = self.queue.start_drain_loop.call_args.kwargs["execute_fn"]
                self.listener.execute_command.return_value = "executed"
                self.assertEqual(replay(*command), "executed")
                self.listener.execute_command.assert_called_once_with(*command, self.client)

    def test_online_session_target_commands_still_execute(self):
        for command in (
            ("record_result", ("7", "pH")),
            ("start_test", ("pH",)),
            ("mark_complete", ()),
        ):
            with self.subTest(command=command[0]):
                self.reset_listener()
                self.listener.execute_command.return_value = "executed"
                self.run_one_command(command, online=True)
                self.listener.execute_command.assert_called_once_with(*command, self.client)
                self.queue.enqueue.assert_not_called()
                self.assertIn("executed", self.listener.speak.call_args_list[-2].args[0])


if __name__ == "__main__":
    unittest.main()
