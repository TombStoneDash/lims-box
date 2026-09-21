"""Label feedback regression tests using synthetic samples and local mocks."""

import unittest
from unittest.mock import Mock, call
from urllib.error import HTTPError

from senaite.client import SenaiteClient
from voice.commands import execute_command


class LabelFeedbackTests(unittest.TestCase):
    def setUp(self):
        self.client = Mock(spec=SenaiteClient)
        self.client.get_sample.return_value = {
            "uid": "synthetic-uid",
            "api_url": "https://example.invalid/sample",
        }
        self.client.post.return_value = {}

    def execute(self):
        return execute_command("print_label", ("sa-2026-001",), self.client)

    def assert_calls(self, post_count):
        self.client.get_sample.assert_called_once_with("SA-2026-001")
        self.assertEqual(self.client.post.call_count, post_count)
        expected = [call.get_sample("SA-2026-001")]
        if post_count:
            expected.append(call.post(
                "AnalysisRequest/synthetic-uid/sticker",
                {"template": "Code_128_1x48mm.pt"},
            ))
        self.assertEqual(self.client.mock_calls, expected)

    def test_missing_metadata_does_not_send(self):
        for field in ("api_url", "uid"):
            for value in ("absent", None, ""):
                with self.subTest(field=field, value=value):
                    sample = {
                        "uid": "synthetic-uid",
                        "api_url": "https://example.invalid/sample",
                    }
                    if value == "absent":
                        del sample[field]
                    else:
                        sample[field] = value
                    self.client.reset_mock()
                    self.client.get_sample.return_value = sample
                    self.assertEqual(
                        self.execute(),
                        "Label request not sent for sample SA-2026-001: required sample metadata is missing.",
                    )
                    self.assert_calls(0)

    def test_absent_sample_does_not_send(self):
        self.client.get_sample.return_value = None
        self.assertEqual(
            self.execute(),
            "Sample SA-2026-001 not found. Cannot print label.",
        )
        self.assert_calls(0)

    def test_request_exception_reports_failure(self):
        self.client.post.side_effect = RuntimeError("synthetic request failure")
        with self.assertLogs("voice.commands", level="WARNING"):
            self.assertEqual(
                self.execute(),
                "Label request failed for sample SA-2026-001. Printing is not confirmed.",
            )
        self.assert_calls(1)

    def test_api_rejection_reports_failure(self):
        self.client.post.side_effect = HTTPError(
            "https://example.invalid/sticker", 400, "Rejected", None, None,
        )
        with self.assertLogs("voice.commands", level="WARNING"):
            self.assertEqual(
                self.execute(),
                "Label request failed for sample SA-2026-001. Printing is not confirmed.",
            )
        self.assert_calls(1)

    def test_success_reports_submission_without_confirming_printing(self):
        self.assertEqual(
            self.execute(),
            "Label request submitted to SENAITE for sample SA-2026-001. Printing is not confirmed.",
        )
        self.assert_calls(1)


if __name__ == "__main__":
    unittest.main()
