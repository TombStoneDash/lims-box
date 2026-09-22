"""Offline regression tests for truthful start-test lookup failure feedback."""

import unittest
from unittest.mock import Mock, patch

from senaite.client import SenaiteClient
from voice import commands


class StartTestFailureFeedbackTests(unittest.TestCase):
    def execute(self, lookup_data=None, lookup_error=None):
        client = Mock(spec_set=SenaiteClient)
        client.get_sample.return_value = {"uid": "sample-uid"}
        client.get.return_value = lookup_data
        client.get.side_effect = lookup_error
        context = commands.SessionContext()
        context.set_sample("SA-001", "cached-uid")
        with patch.object(commands, "session", context):
            feedback = commands.execute_command("start_test", ("pH",), client)
            self.assertIs(commands.session, context)

        self.assertEqual(context.current_sample_id, "SA-001")
        self.assertEqual(context.current_sample_uid, "cached-uid")
        client.get_sample.assert_called_once_with("SA-001")
        client.get.assert_called_once_with(
            "Analysis?getParentUID=sample-uid&getKeyword=pH"
        )
        for method in ("post", "create_sample", "record_result", "transition_sample",
                       "_request"):
            getattr(client, method).assert_not_called()
        self.assertEqual(
            [call[0] for call in client.mock_calls], ["get_sample", "get"]
        )
        return feedback

    def assert_failure(self, feedback):
        self.assertEqual(
            feedback,
            "Could not check test pH on sample SA-001. Please try again.",
        )
        for misleading_phrase in ("noted", "started", "awaiting results"):
            self.assertNotIn(misleading_phrase, feedback.lower())

    def test_transport_failure_reports_failure_and_invites_retry(self):
        with self.assertLogs(commands.logger, level="WARNING"):
            feedback = self.execute(lookup_error=RuntimeError("offline failure"))
        self.assert_failure(feedback)

    def test_malformed_lookup_data_reports_failure_and_invites_retry(self):
        for data in (None, [], {"items": [None]}, {"items": ["invalid analysis"]}):
            with self.subTest(data=data):
                with self.assertLogs(commands.logger, level="WARNING"):
                    feedback = self.execute(lookup_data=data)
                self.assert_failure(feedback)

    def test_successful_lookup_preserves_feedback(self):
        self.assertEqual(
            self.execute({"items": [{"review_state": "sample_received"}]}),
            "Test pH started on sample SA-001. Awaiting results.",
        )

    def test_missing_test_preserves_feedback(self):
        self.assertEqual(
            self.execute({"items": []}),
            "Test 'pH' is not configured on sample SA-001.",
        )

    def test_completed_test_preserves_feedback(self):
        for state in ("verified", "published"):
            with self.subTest(state=state):
                self.assertEqual(
                    self.execute({"items": [{"review_state": state}]}),
                    f"Test pH is already {state}.",
                )


if __name__ == "__main__":
    unittest.main()
