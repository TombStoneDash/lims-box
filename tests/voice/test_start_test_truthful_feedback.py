"""Offline regression tests for truthful start-test lookup feedback."""

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

    post = put = patch = delete = unexpected_write
    create_sample = record_result = transition_sample = unexpected_write
    _request = unexpected_write


class StartTestTruthfulFeedbackTests(unittest.TestCase):
    def execute(self, client):
        context = commands.SessionContext()
        context.set_sample("SA-2026-001", "cached-uid")
        with patch.object(commands, "session", context):
            feedback = commands.execute_command("start_test", ("pH",), client)

        self.assertEqual(context.current_sample_id, "SA-2026-001")
        self.assertEqual(context.current_sample_uid, "cached-uid")
        self.assertEqual(client.writes, [])
        for claim in ("started", "saved", "awaiting results"):
            self.assertNotIn(claim, feedback.lower())
        return feedback

    def test_lookup_reports_observed_state_without_claiming_a_change(self):
        for analysis, expected_state in (
            ({"review_state": "sample_received"}, "sample_received"),
            ({"review_state": "to_be_verified"}, "to_be_verified"),
            ({}, "unknown"),
            ({"review_state": None}, "unknown"),
            ({"review_state": ""}, "unknown"),
        ):
            with self.subTest(analysis=analysis):
                client = FakeClient(analysis)
                self.assertEqual(
                    self.execute(client),
                    "Test pH found on sample SA-2026-001. "
                    f"Observed state: {expected_state}. No workflow change was made.",
                )
                self.assertEqual(client.calls, [
                    ("get_sample", "SA-2026-001"),
                    ("get", "Analysis?getParentUID=sample-uid&getKeyword=pH"),
                ])

    def test_missing_sample_preserves_feedback_and_skips_analysis_lookup(self):
        client = FakeClient({}, sample_exists=False)
        self.assertEqual(
            self.execute(client), "Sample SA-2026-001 not found in SENAITE."
        )
        self.assertEqual(client.calls, [("get_sample", "SA-2026-001")])


if __name__ == "__main__":
    unittest.main()
