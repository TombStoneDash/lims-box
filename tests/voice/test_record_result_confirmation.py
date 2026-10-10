"""Synthetic, mock-only checks for truthful result-write feedback."""

import unittest
from unittest.mock import Mock, call, patch

from voice import commands


class RecordResultConfirmationTests(unittest.TestCase):
    def setUp(self):
        self.context = commands.SessionContext()
        self.context.set_sample("SYNTH-A", "synthetic-uid")
        session_patch = patch.object(commands, "session", self.context)
        session_patch.start()
        self.addCleanup(session_patch.stop)
        self.client = Mock(spec=commands.SenaiteClient)

    def execute(self):
        return commands.execute_command("record_result", (" 7 ", " pH "), self.client)

    def assert_one_attempt_and_unchanged_sample(self):
        self.assertEqual(self.client.mock_calls, [call.record_result("SYNTH-A", "pH", "7")])
        self.assertEqual(self.context.current_sample_id, "SYNTH-A")
        self.assertEqual(self.context.current_sample_uid, "synthetic-uid")

    def assert_unconfirmed(self, feedback):
        self.assertEqual(
            feedback,
            "Result write for pH on sample SYNTH-A was not confirmed. "
            "Current sample unchanged. Check the result before retrying.",
        )
        self.assertNotIn("recorded", feedback.lower())
        self.assert_one_attempt_and_unchanged_sample()

    def test_explicit_rejection_is_unconfirmed(self):
        self.client.record_result.return_value = {"success": False, "error": "rejected"}
        self.assert_unconfirmed(self.execute())

    def test_missing_empty_and_malformed_acknowledgments_are_unconfirmed(self):
        for acknowledgment in (
            None, {}, [], "", "success", True, 1, [{"success": True}],
            {"uid": "synthetic-analysis"}, {"success": None},
            {"success": "true"}, {"success": "false"}, {"success": 1},
            {"success": 0}, {"success": []}, {"success": {}},
            {"accepted": True},
        ):
            with self.subTest(acknowledgment=acknowledgment):
                self.client.reset_mock()
                self.client.record_result.return_value = acknowledgment
                self.assert_unconfirmed(self.execute())

    def test_contradictory_acknowledgments_are_unconfirmed(self):
        for acknowledgment in (
            {"success": True, "error": "rejected"},
            {"success": True, "errors": ["rejected"]},
        ):
            with self.subTest(acknowledgment=acknowledgment):
                self.client.reset_mock()
                self.client.record_result.return_value = acknowledgment
                self.assert_unconfirmed(self.execute())

    def test_success_acknowledges_acceptance_without_claiming_persistence(self):
        self.client.record_result.return_value = {"success": True}
        feedback = self.execute()
        self.assertEqual(
            feedback,
            "Result write request accepted for 7 for pH on sample SYNTH-A. "
            "Persistence has not been verified.",
        )
        self.assertNotIn("recorded", feedback.lower())
        self.assert_one_attempt_and_unchanged_sample()

    def test_exceptions_do_not_retry_or_claim_failure_to_persist(self):
        for error in (TimeoutError("response lost"), ValueError("invalid JSON"),
                      RuntimeError("connection closed")):
            with self.subTest(error=error):
                self.client.reset_mock()
                self.client.record_result.side_effect = error
                self.assert_unconfirmed(self.execute())

    def test_no_active_sample_makes_no_write_attempt(self):
        self.context.clear()
        self.assertEqual(self.execute(), "No current sample. Say 'log sample' first.")
        self.assertEqual(self.client.mock_calls, [])


if __name__ == "__main__":
    unittest.main()
