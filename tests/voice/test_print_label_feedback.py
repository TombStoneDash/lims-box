"""Offline regression tests for truthful label print feedback."""

import unittest
from unittest.mock import patch

from voice import commands


class FakeClient:
    def __init__(self, sample, post_error=None):
        self.sample = sample
        self.post_error = post_error
        self.lookups = []
        self.posts = []

    def get_sample(self, sample_id):
        self.lookups.append(sample_id)
        return self.sample

    def post(self, endpoint, payload):
        self.posts.append((endpoint, payload))
        if self.post_error is not None:
            raise self.post_error
        return {}


class PrintLabelFeedbackTests(unittest.TestCase):
    def execute(self, client):
        context = commands.SessionContext()
        context.set_sample("OTHER-SAMPLE", "other-uid")
        with patch.object(commands, "session", context):
            feedback = commands.execute_command(
                "print_label", ("sa dash 2026 dash 001",), client
            )
        self.assertEqual(client.lookups, ["SA-2026-001"])
        self.assertEqual(context.current_sample_id, "OTHER-SAMPLE")
        self.assertEqual(context.current_sample_uid, "other-uid")
        return feedback

    def test_missing_api_url_is_unavailable_without_post(self):
        for metadata in ({}, {"api_url": None}, {"api_url": ""}):
            with self.subTest(metadata=metadata):
                client = FakeClient({"uid": "sample-uid", **metadata})
                self.assertEqual(
                    self.execute(client),
                    "Label printing unavailable for sample SA-2026-001: "
                    "required sample metadata is missing.",
                )
                self.assertEqual(client.posts, [])

    def test_missing_uid_is_unavailable_without_post(self):
        for metadata in ({}, {"uid": None}, {"uid": ""}):
            with self.subTest(metadata=metadata):
                client = FakeClient({"api_url": "https://offline.invalid/sample", **metadata})
                self.assertEqual(
                    self.execute(client),
                    "Label printing unavailable for sample SA-2026-001: "
                    "required sample metadata is missing.",
                )
                self.assertEqual(client.posts, [])

    def test_unknown_sample_does_not_post(self):
        client = FakeClient(None)
        self.assertEqual(
            self.execute(client),
            "Sample SA-2026-001 not found. Cannot print label.",
        )
        self.assertEqual(client.posts, [])

    def test_post_exception_reports_request_failure(self):
        client = FakeClient(
            {"uid": "sample-uid", "api_url": "https://offline.invalid/sample"},
            post_error=RuntimeError("offline POST failure"),
        )
        with self.assertLogs(commands.logger, level="WARNING"):
            feedback = self.execute(client)
        self.assertEqual(feedback, "Label print request failed for sample SA-2026-001.")
        self.assertEqual(client.posts, [
            ("AnalysisRequest/sample-uid/sticker", {"template": "Code_128_1x48mm.pt"}),
        ])

    def test_success_acknowledges_request_and_posts_exactly_once(self):
        client = FakeClient(
            {"uid": "sample-uid", "api_url": "https://offline.invalid/sample"}
        )
        self.assertEqual(
            self.execute(client),
            "Label print request accepted for sample SA-2026-001.",
        )
        self.assertEqual(client.posts, [
            ("AnalysisRequest/sample-uid/sticker", {"template": "Code_128_1x48mm.pt"}),
        ])


if __name__ == "__main__":
    unittest.main()
