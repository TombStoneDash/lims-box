"""Mock-only checks for spoken submission confirmation and session retention."""

import unittest
from unittest.mock import Mock, call, patch

from voice import commands


class MarkCompleteConfirmationTests(unittest.TestCase):
    def setUp(self):
        self.context = commands.SessionContext()
        self.context.set_sample("SYNTHETIC-001", "synthetic-uid")
        session_patch = patch.object(commands, "session", self.context)
        session_patch.start()
        self.addCleanup(session_patch.stop)
        self.client = Mock(spec=["transition_sample"])

    def execute(self):
        return commands.execute_command("mark_complete", (), self.client)

    def assert_active_sample(self):
        self.assertEqual(self.context.current_sample_id, "SYNTHETIC-001")
        self.assertEqual(self.context.current_sample_uid, "synthetic-uid")

    def assert_one_submission(self):
        self.assertEqual(self.client.mock_calls, [
            call.transition_sample("SYNTHETIC-001", "submit"),
        ])

    def assert_unconfirmed(self, response):
        self.client.transition_sample.return_value = response
        self.assertEqual(
            self.execute(),
            "Submission of sample SYNTHETIC-001 was not confirmed. "
            "Current sample unchanged.",
        )
        self.assert_active_sample()
        self.assert_one_submission()

    def test_rejected_empty_and_malformed_responses_keep_active_sample(self):
        responses = (
            {"success": False, "error": "rejected"},
            {}, None, [], "ok", True,
            {"success": "true"}, {"success": 1},
            {"success": True, "error": "rejected"},
            {"success": False, "review_state": "to_be_verified"},
            {"success": True, "review_state": "sample_received"},
            {"success": True, "review_state": ""},
            {"success": True, "review_state": ["to_be_verified"]},
        )
        for response in responses:
            with self.subTest(response=response):
                self.client.reset_mock()
                self.assert_unconfirmed(response)

    def test_confirmed_submission_reports_observed_state_and_clears_session(self):
        self.client.transition_sample.return_value = {
            "success": True, "review_state": "to_be_verified",
        }
        self.assertEqual(
            self.execute(),
            "Sample SYNTHETIC-001 submitted for review. "
            "Observed state: to_be_verified.",
        )
        self.assertIsNone(self.context.current_sample_id)
        self.assertIsNone(self.context.current_sample_uid)
        self.assert_one_submission()

    def test_confirmed_submission_without_state_does_not_invent_one(self):
        self.client.transition_sample.return_value = {"success": True}
        self.assertEqual(
            self.execute(),
            "Submission of sample SYNTHETIC-001 confirmed by SENAITE.",
        )
        self.assertIsNone(self.context.current_sample_id)
        self.assertIsNone(self.context.current_sample_uid)
        self.assert_one_submission()

    def test_timeout_keeps_context_and_makes_no_automatic_retry(self):
        self.client.transition_sample.side_effect = TimeoutError("response lost")
        with self.assertLogs(commands.logger, level="WARNING"):
            feedback = self.execute()
        self.assertEqual(
            feedback,
            "Submission of sample SYNTHETIC-001 was not confirmed. "
            "Current sample unchanged.",
        )
        self.assert_active_sample()
        self.assert_one_submission()

    def test_no_active_sample_makes_no_submission(self):
        self.context.clear()
        self.assertEqual(
            self.execute(),
            "No current sample. Say 'log sample' first to set the active sample.",
        )
        self.client.transition_sample.assert_not_called()


if __name__ == "__main__":
    unittest.main()
