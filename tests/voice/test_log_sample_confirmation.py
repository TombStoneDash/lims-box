"""Mock-only regression tests for log-sample creation confirmation."""

import unittest
from unittest.mock import Mock, call, patch

from voice import commands


class LogSampleConfirmationTests(unittest.TestCase):
    def setUp(self):
        self.context = commands.SessionContext()
        self.context.set_sample("PREVIOUS", "previous-uid")
        self.session_patch = patch.object(commands, "session", self.context)
        self.session_patch.start()
        self.addCleanup(self.session_patch.stop)
        self.client = Mock(spec=["get_sample", "create_sample"])
        self.client.get_sample.return_value = None

    def execute(self):
        return commands.execute_command("log_sample", ("sa dash 123",), self.client)

    def assert_single_creation(self):
        self.assertEqual(self.client.mock_calls, [
            call.get_sample("SA-123"), call.create_sample("SA-123"),
        ])

    def assert_previous_sample(self):
        self.assertEqual(self.context.current_sample_id, "PREVIOUS")
        self.assertEqual(self.context.current_sample_uid, "previous-uid")

    def test_valid_uid_confirms_creation_and_sets_context(self):
        self.client.create_sample.return_value = {"uid": "new-uid"}
        self.assertEqual(self.execute(), "Sample SA-123 has been logged.")
        self.assertEqual(self.context.current_sample_id, "SA-123")
        self.assertEqual(self.context.current_sample_uid, "new-uid")
        self.assert_single_creation()

    def test_unconfirmed_responses_preserve_previous_sample_without_retry(self):
        responses = (
            {}, None, [], [{"uid": "new-uid"}], "new-uid", 1, True,
            {"id": "SA-123"}, {"uid": None}, {"uid": ""},
            {"uid": " \t\n"}, {"uid": 123}, {"uid": False},
            {"uid": []}, {"uid": {}},
        )
        for response in responses:
            with self.subTest(response=response):
                self.client.reset_mock()
                self.client.create_sample.return_value = response
                self.assertEqual(
                    self.execute(),
                    "Creation of sample SA-123 could not be confirmed.",
                )
                self.assert_previous_sample()
                self.assert_single_creation()

    def test_unconfirmed_creation_leaves_empty_context_empty(self):
        self.context.clear()
        self.client.create_sample.return_value = {}
        self.assertIn("could not be confirmed", self.execute())
        self.assertIsNone(self.context.current_sample_id)
        self.assertIsNone(self.context.current_sample_uid)
        self.assert_single_creation()

    def test_creation_exception_preserves_existing_error_behavior_and_context(self):
        self.client.create_sample.side_effect = RuntimeError("creation failed")
        with self.assertLogs("voice.commands", level="ERROR"):
            self.assertEqual(self.execute(), "Error executing command: creation failed")
        self.assert_previous_sample()
        self.assert_single_creation()

    def test_existing_sample_sets_context_without_creation(self):
        self.client.get_sample.return_value = {
            "uid": "existing-uid", "review_state": "sample_received",
        }
        self.assertEqual(
            self.execute(),
            "Sample SA-123 already exists. Status: sample_received. Set as current sample.",
        )
        self.assertEqual(self.context.current_sample_id, "SA-123")
        self.assertEqual(self.context.current_sample_uid, "existing-uid")
        self.assertEqual(self.client.mock_calls, [call.get_sample("SA-123")])


if __name__ == "__main__":
    unittest.main()
