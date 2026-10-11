"""Offline regression tests for truthful label print feedback."""

import unittest
from unittest.mock import patch

from voice import commands


class FakeClient:
    def __init__(self, sample, post_error=None, post_response=...):
        self.sample = sample
        self.post_error = post_error
        self.post_response = {"success": True} if post_response is ... else post_response
        self.lookups = []
        self.posts = []

    def get_sample(self, sample_id):
        self.lookups.append(sample_id)
        return self.sample

    def post(self, endpoint, payload):
        self.posts.append((endpoint, payload))
        if self.post_error is not None:
            raise self.post_error
        return self.post_response


class PrintLabelFeedbackTests(unittest.TestCase):
    sample = {"uid": "sample-uid", "api_url": "https://offline.invalid/sample"}
    expected_post = (
        "AnalysisRequest/sample-uid/sticker", {"template": "Code_128_1x48mm.pt"}
    )

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

    def assert_one_post(self, client):
        self.assertEqual(client.posts, [self.expected_post])

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
        self.assert_one_post(client)

    def test_rejected_response_never_reports_acceptance(self):
        for response in (
            {"success": False, "error": "synthetic printer rejection"},
            {"success": False},
            {"error": "synthetic printer rejection"},
            {"success": True, "error": "synthetic printer rejection"},
        ):
            with self.subTest(response=response):
                client = FakeClient(self.sample, post_response=response)
                self.assertEqual(
                    self.execute(client),
                    "Label print request rejected for sample SA-2026-001.",
                )
                self.assert_one_post(client)

    def test_empty_or_malformed_response_is_unconfirmed(self):
        for response in ({}, None, [], "ok", True, {"success": "true"}, {"success": 1}):
            with self.subTest(response=response):
                client = FakeClient(self.sample, post_response=response)
                self.assertEqual(
                    self.execute(client),
                    "Label print request was not confirmed for sample SA-2026-001.",
                )
                self.assert_one_post(client)

    def test_success_acknowledges_request_and_posts_exactly_once(self):
        client = FakeClient(
            {"uid": "sample-uid", "api_url": "https://offline.invalid/sample"}
        )
        self.assertEqual(
            self.execute(client),
            "Label print request accepted for sample SA-2026-001.",
        )
        self.assert_one_post(client)


if __name__ == "__main__":
    unittest.main()
