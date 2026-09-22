"""Offline regression tests for start-test lookup failure feedback."""

import unittest
from unittest.mock import patch

from voice import commands


class FakeClient:
    def __init__(self, items=None, lookup_error=None):
        self.items = items if items is not None else []
        self.lookup_error = lookup_error
        self.calls = []
        self.writes = []

    def get_sample(self, sample_id):
        self.calls.append(("get_sample", sample_id))
        return {"uid": "sample-uid"}

    def get(self, endpoint):
        self.calls.append(("get", endpoint))
        if self.lookup_error is not None:
            raise self.lookup_error
        return {"items": self.items}

    def unexpected_write(self, *args, **kwargs):
        self.writes.append((args, kwargs))
        raise AssertionError("Start-test lookup must not write or transition")

    post = unexpected_write
    create_sample = unexpected_write
    record_result = unexpected_write
    transition_sample = unexpected_write
    _request = unexpected_write


class StartTestFailureFeedbackTests(unittest.TestCase):
    def execute(self, client):
        context = commands.SessionContext()
        context.set_sample("SA-2026-001", "cached-uid")
        with patch.object(commands, "session", context):
            feedback = commands.execute_command("start_test", ("pH",), client)

        self.assertEqual(context.current_sample_id, "SA-2026-001")
        self.assertEqual(context.current_sample_uid, "cached-uid")
        self.assertEqual(client.calls, [
            ("get_sample", "SA-2026-001"),
            ("get", "Analysis?getParentUID=sample-uid&getKeyword=pH"),
        ])
        self.assertEqual(client.writes, [])
        return feedback

    def test_lookup_exception_reports_failure_and_invites_retry(self):
        client = FakeClient(lookup_error=RuntimeError("offline lookup failure"))
        with self.assertLogs(commands.logger, level="WARNING") as logs:
            feedback = self.execute(client)

        self.assertIn("Could not look up test 'pH'", feedback)
        self.assertIn("sample SA-2026-001", feedback)
        self.assertIn("Please try again", feedback)
        for claim in ("started", "noted", "saved", "awaiting results"):
            self.assertNotIn(claim, feedback.lower())
        self.assertIn(
            "Could not look up test 'pH': offline lookup failure", logs.output[0]
        )

    def test_successful_lookup_reports_observed_state(self):
        client = FakeClient(items=[{"review_state": "sample_received"}])
        self.assertEqual(
            self.execute(client),
            "Test pH found on sample SA-2026-001. "
            "Observed state: sample_received. No workflow change was made.",
        )

    def test_missing_test_preserves_feedback(self):
        self.assertEqual(
            self.execute(FakeClient()),
            "Test 'pH' is not configured on sample SA-2026-001.",
        )

    def test_verified_and_published_preserve_feedback(self):
        for state in ("verified", "published"):
            with self.subTest(state=state):
                client = FakeClient(items=[{"review_state": state}])
                self.assertEqual(
                    self.execute(client), f"Test pH is already {state}."
                )


if __name__ == "__main__":
    unittest.main()
