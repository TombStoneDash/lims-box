"""Offline regression tests for start-test lookup failure feedback."""

import unittest
from unittest.mock import Mock, patch

from voice import commands


class StartTestFailureFeedbackTests(unittest.TestCase):
    def setUp(self):
        self.context = commands.SessionContext()
        self.context.set_sample("SA-001", "cached-uid")
        session_patch = patch.object(commands, "session", self.context)
        session_patch.start()
        self.addCleanup(session_patch.stop)
        self.client = Mock(spec=commands.SenaiteClient)
        self.client.get_sample.return_value = {"uid": "sample-uid"}

    def execute(self):
        return commands.execute_command("start_test", ("pH",), self.client)

    def assert_lookup_only(self):
        self.client.get_sample.assert_called_once_with("SA-001")
        self.client.get.assert_called_once_with(
            "Analysis?getParentUID=sample-uid&getKeyword=pH"
        )
        self.client.post.assert_not_called()
        self.assertEqual(self.context.current_sample_id, "SA-001")
        self.assertEqual(self.context.current_sample_uid, "cached-uid")

    def assert_failure_feedback(self, feedback):
        self.assertIn("could not be checked or started", feedback.lower())
        self.assertIn("retry", feedback.lower())
        for claim in ("recorded", "noted", "awaiting results", "test ph started"):
            self.assertNotIn(claim, feedback.lower())
        self.assert_lookup_only()

    def test_transport_exception(self):
        self.client.get.side_effect = OSError("Connection lost")

        feedback = self.execute()

        self.assert_failure_feedback(feedback)

    def test_malformed_analysis_response(self):
        for response in (None, [], {"items": [None]}):
            with self.subTest(response=response):
                self.client.reset_mock()
                self.client.get.return_value = response

                feedback = self.execute()

                self.assert_failure_feedback(feedback)

    def test_successful_lookup(self):
        self.client.get.return_value = {
            "items": [{"review_state": "sample_received"}]
        }

        feedback = self.execute()

        self.assertEqual(
            feedback, "Test pH started on sample SA-001. Awaiting results."
        )
        self.assert_lookup_only()

    def test_missing_sample(self):
        self.client.get_sample.return_value = None

        self.assertEqual(self.execute(), "Sample SA-001 not found in SENAITE.")

        self.client.get.assert_not_called()
        self.client.post.assert_not_called()

    def test_unconfigured_test(self):
        self.client.get.return_value = {"items": []}

        self.assertEqual(
            self.execute(), "Test 'pH' is not configured on sample SA-001."
        )
        self.assert_lookup_only()

    def test_verified_or_published_test(self):
        for state in ("verified", "published"):
            with self.subTest(state=state):
                self.client.reset_mock()
                self.client.get.return_value = {"items": [{"review_state": state}]}

                self.assertEqual(self.execute(), f"Test pH is already {state}.")
                self.assert_lookup_only()


if __name__ == "__main__":
    unittest.main()
