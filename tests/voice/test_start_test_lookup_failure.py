"""Offline regression tests for start-test lookup feedback."""

import unittest
from unittest.mock import Mock, call, patch

from voice import commands


class StartTestLookupFailureTests(unittest.TestCase):
    def setUp(self):
        self.context = commands.SessionContext()
        self.context.set_sample("SA-001", "cached-uid")
        self.client = Mock(spec=commands.SenaiteClient)
        self.client.get_sample.return_value = {"uid": "sample-uid"}
        self.client.get.return_value = {
            "items": [{"review_state": "sample_received"}]
        }

    def execute(self, expected_calls):
        original_context = vars(self.context).copy()
        with patch.object(commands, "session", self.context):
            feedback = commands.execute_command("start_test", ("pH",), self.client)
            self.assertIs(commands.session, self.context)
        self.assertEqual(vars(self.context), original_context)
        # The complete call list permits only reads, ruling out writes/transitions.
        self.assertEqual(self.client.mock_calls, expected_calls)
        return feedback

    def execute_lookup(self):
        return self.execute([
            call.get_sample("SA-001"),
            call.get("Analysis?getParentUID=sample-uid&getKeyword=pH"),
        ])

    def test_analysis_lookup_exception_requests_retry(self):
        self.client.get.side_effect = RuntimeError("offline lookup failure")
        with self.assertLogs(commands.logger, level="WARNING"):
            feedback = self.execute_lookup()
        self.assertEqual(
            feedback,
            "Could not check test pH on sample SA-001. Please retry.",
        )
        for claim in ("started", "noted", "queued", "awaiting results"):
            self.assertNotIn(claim, feedback.lower())

    def test_successful_lookup_feedback_is_unchanged(self):
        self.assertEqual(
            self.execute_lookup(),
            "Test pH started on sample SA-001. Awaiting results.",
        )

    def test_missing_active_sample_skips_client(self):
        self.context.clear()
        self.assertEqual(
            self.execute([]),
            "No current sample. Say 'log sample' first to set the active sample.",
        )

    def test_missing_sample_skips_analysis_lookup(self):
        self.client.get_sample.return_value = None
        self.assertEqual(
            self.execute([call.get_sample("SA-001")]),
            "Sample SA-001 not found in SENAITE.",
        )

    def test_missing_test_feedback_is_unchanged(self):
        self.client.get.return_value = {"items": []}
        self.assertEqual(
            self.execute_lookup(),
            "Test 'pH' is not configured on sample SA-001.",
        )

    def test_verified_and_published_feedback_is_unchanged(self):
        for state in ("verified", "published"):
            with self.subTest(state=state):
                self.client.reset_mock()
                self.client.get.return_value = {"items": [{"review_state": state}]}
                self.assertEqual(
                    self.execute_lookup(), f"Test pH is already {state}."
                )


if __name__ == "__main__":
    unittest.main()
