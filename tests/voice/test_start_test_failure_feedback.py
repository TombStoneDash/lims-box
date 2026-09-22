"""Offline regression tests for start-test lookup failure feedback."""

import unittest
from unittest.mock import Mock, patch

from voice import commands


class FakeClient:
    def __init__(self, analyses=None, error=None):
        self.analyses = analyses
        self.error = error
        self.lookups = []
        self.queries = []
        self.post = Mock()
        self.create_sample = Mock()
        self.record_result = Mock()
        self.transition_sample = Mock()

    def get_sample(self, sample_id):
        self.lookups.append(sample_id)
        return {"uid": "sample-uid"}

    def get(self, endpoint):
        self.queries.append(endpoint)
        if self.error is not None:
            raise self.error
        return self.analyses


class StartTestFailureFeedbackTests(unittest.TestCase):
    def execute(self, client):
        context = commands.SessionContext()
        context.set_sample("SA-001", "cached-uid")
        with patch.object(commands, "session", context):
            feedback = commands.execute_command("start_test", ("pH",), client)

        self.assertEqual(context.current_sample_id, "SA-001")
        self.assertEqual(context.current_sample_uid, "cached-uid")
        self.assertEqual(client.lookups, ["SA-001"])
        self.assertEqual(
            client.queries, ["Analysis?getParentUID=sample-uid&getKeyword=pH"]
        )
        for write in (
            client.post, client.create_sample,
            client.record_result, client.transition_sample,
        ):
            write.assert_not_called()
        return feedback

    def assert_lookup_failure(self, client):
        with self.assertLogs(commands.logger, level="WARNING"):
            feedback = self.execute(client)
        self.assertIn("could not be checked", feedback.lower())
        self.assertIn("try again", feedback.lower())
        self.assertIn("pH", feedback)
        self.assertIn("SA-001", feedback)
        for misleading in ("noted", "started", "awaiting results"):
            self.assertNotIn(misleading, feedback.lower())

    def test_transport_failure(self):
        self.assert_lookup_failure(FakeClient(error=RuntimeError("offline failure")))

    def test_malformed_lookup_data(self):
        for analyses in (None, [], {"items": [None]}, {"items": ["invalid"]}):
            with self.subTest(analyses=analyses):
                self.assert_lookup_failure(FakeClient(analyses=analyses))

    def test_normal_lookup_preserves_success_feedback(self):
        client = FakeClient({"items": [{"review_state": "sample_received"}]})
        self.assertEqual(
            self.execute(client),
            "Test pH started on sample SA-001. Awaiting results.",
        )

    def test_completed_test_preserves_feedback(self):
        for state in ("verified", "published"):
            with self.subTest(state=state):
                client = FakeClient({"items": [{"review_state": state}]})
                self.assertEqual(self.execute(client), f"Test pH is already {state}.")

    def test_missing_test_preserves_feedback(self):
        self.assertEqual(
            self.execute(FakeClient({"items": []})),
            "Test 'pH' is not configured on sample SA-001.",
        )


if __name__ == "__main__":
    unittest.main()
