"""Offline regressions for confirmed sample creation and session preservation."""

import unittest
from unittest.mock import Mock, call, patch

from voice import commands


class LogSampleConfirmationTests(unittest.TestCase):
    def setUp(self):
        self.context = commands.SessionContext()
        self.context.set_sample("PREVIOUS-001", "previous-uid")
        session_patch = patch.object(commands, "session", self.context)
        session_patch.start()
        self.addCleanup(session_patch.stop)
        self.client = Mock(spec=commands.SenaiteClient)
        self.client.get_sample.return_value = None

    def execute(self):
        return commands.execute_command(
            "log_sample", ("new dash 0 0 1",), self.client
        )

    def assert_session(self, sample_id, uid):
        self.assertEqual(self.context.current_sample_id, sample_id)
        self.assertEqual(self.context.current_sample_uid, uid)

    def assert_one_creation_attempt(self):
        self.client.get_sample.assert_called_once_with("NEW-001")
        self.client.create_sample.assert_called_once_with("NEW-001")
        self.assertEqual(self.client.mock_calls, [
            call.get_sample("NEW-001"), call.create_sample("NEW-001"),
        ])

    def assert_unconfirmed(self, feedback):
        self.assertEqual(
            feedback,
            "Creation of sample NEW-001 was not confirmed. Current sample unchanged.",
        )
        self.assert_session("PREVIOUS-001", "previous-uid")
        self.assert_one_creation_attempt()

    def test_valid_creation_confirms_and_replaces_session(self):
        self.client.create_sample.return_value = {"uid": "new-uid"}
        self.assertEqual(self.execute(), "Sample NEW-001 has been logged.")
        self.assert_session("NEW-001", "new-uid")
        self.assert_one_creation_attempt()

    def test_empty_or_missing_uid_response_preserves_session(self):
        for response in ({}, None, {"id": "NEW-001"}):
            with self.subTest(response=response):
                self.client.reset_mock()
                self.client.create_sample.return_value = response
                self.assert_unconfirmed(self.execute())

    def test_non_dictionary_response_preserves_session(self):
        for response in ([], [{"uid": "new-uid"}], "new-uid", 1, True):
            with self.subTest(response=response):
                self.client.reset_mock()
                self.client.create_sample.return_value = response
                self.assert_unconfirmed(self.execute())

    def test_blank_or_non_string_uid_preserves_session(self):
        for uid in ("", " \t\n", None, 0, 42, False, True, [], {"uid": "new-uid"}):
            with self.subTest(uid=uid):
                self.client.reset_mock()
                self.client.create_sample.return_value = {"uid": uid}
                self.assert_unconfirmed(self.execute())

    def test_creation_exception_preserves_session_without_retry(self):
        for error in (RuntimeError("write failed"), TimeoutError("response lost")):
            with self.subTest(error=error):
                self.client.reset_mock()
                self.client.create_sample.side_effect = error
                with self.assertLogs(commands.logger, level="WARNING"):
                    feedback = self.execute()
                self.assert_unconfirmed(feedback)

    def test_lookup_exception_preserves_session_without_creation(self):
        self.client.get_sample.side_effect = RuntimeError("lookup failed")
        with self.assertLogs(commands.logger, level="ERROR"):
            feedback = self.execute()
        self.assertEqual(feedback, "Error executing command: lookup failed")
        self.assert_session("PREVIOUS-001", "previous-uid")
        self.client.get_sample.assert_called_once_with("NEW-001")
        self.client.create_sample.assert_not_called()
        self.assertEqual(self.client.mock_calls, [call.get_sample("NEW-001")])

    def test_existing_sample_is_selected_without_creation(self):
        self.client.get_sample.return_value = {
            "uid": "existing-uid", "review_state": "received",
        }
        self.assertEqual(
            self.execute(),
            "Sample NEW-001 already exists. Status: received. Set as current sample.",
        )
        self.assert_session("NEW-001", "existing-uid")
        self.client.get_sample.assert_called_once_with("NEW-001")
        self.client.create_sample.assert_not_called()
        self.assertEqual(self.client.mock_calls, [call.get_sample("NEW-001")])


if __name__ == "__main__":
    unittest.main()
