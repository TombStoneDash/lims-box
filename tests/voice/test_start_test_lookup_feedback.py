"""Offline regression tests for truthful, read-only start-test feedback."""

import unittest
from unittest.mock import patch

from voice import commands


class FakeClient:
    def __init__(self, analysis, sample_exists=True):
        self.analysis = analysis
        self.sample_exists = sample_exists
        self.calls = []
        self.writes = []

    def get_sample(self, sample_id):
        self.calls.append(("get_sample", sample_id))
        return {"uid": "sample-uid"} if self.sample_exists else None

    def get(self, endpoint):
        self.calls.append(("get", endpoint))
        return {"items": [self.analysis]}

    def unexpected_write(self, *args, **kwargs):
        self.writes.append((args, kwargs))
        raise AssertionError("Start-test lookup must not write or transition")

    post = unexpected_write
    create_sample = unexpected_write
    record_result = unexpected_write
    transition_sample = unexpected_write
    _request = unexpected_write


class StartTestLookupFeedbackTests(unittest.TestCase):
    def execute(self, client):
        context = commands.SessionContext()
        context.set_sample("SA-2026-001", "cached-uid")
        with patch.object(commands, "session", context):
            feedback = commands.execute_command("start_test", (" pH ",), client)
            self.assertIs(commands.session, context)

        self.assertEqual(context.current_sample_id, "SA-2026-001")
        self.assertEqual(context.current_sample_uid, "cached-uid")
        self.assertEqual(client.writes, [])
        return feedback

    def test_successful_lookup_does_not_claim_a_workflow_change(self):
        for analysis in (
            {"review_state": "sample_received"},
            {"review_state": "to_be_verified"},
            {"review_state": ""},
            {},
        ):
            with self.subTest(analysis=analysis):
                client = FakeClient(analysis)
                feedback = self.execute(client)
                self.assertEqual(
                    feedback,
                    "Test pH is configured on active sample SA-2026-001. "
                    "No workflow change was made.",
                )
                for claim in ("started", "awaiting results", "saved", "submitted"):
                    self.assertNotIn(claim, feedback.lower())
                self.assertEqual(client.calls, [
                    ("get_sample", "SA-2026-001"),
                    ("get", "Analysis?getParentUID=sample-uid&getKeyword=pH"),
                ])

    def test_missing_sample_preserves_feedback(self):
        client = FakeClient({}, sample_exists=False)
        self.assertEqual(
            self.execute(client), "Sample SA-2026-001 not found in SENAITE."
        )
        self.assertEqual(client.calls, [("get_sample", "SA-2026-001")])


if __name__ == "__main__":
    unittest.main()
