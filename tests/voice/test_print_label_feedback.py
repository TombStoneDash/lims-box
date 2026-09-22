"""Print feedback regression tests using only a mocked SENAITE client."""

import unittest
from unittest.mock import create_autospec, patch

from senaite.client import SenaiteClient
from voice import commands


class PrintLabelFeedbackTests(unittest.TestCase):
    def setUp(self):
        self.client = create_autospec(SenaiteClient, instance=True)
        self.client.get_sample.return_value = {
            "uid": "sample-uid",
            "api_url": "https://example.invalid/sample",
        }
        self.client.post.return_value = {}
        self.context = commands.SessionContext()
        self.context.set_sample("CURRENT-SAMPLE", "current-uid")
        context_patch = patch.object(commands, "session", self.context)
        context_patch.start()
        self.addCleanup(context_patch.stop)

    def execute(self):
        reply = commands.execute_command(
            "print_label", ("sa dash 2026 dash 0042",), self.client
        )
        self.client.get_sample.assert_called_once_with("SA-2026-0042")
        self.assertEqual(self.context.current_sample_id, "CURRENT-SAMPLE")
        self.assertEqual(self.context.current_sample_uid, "current-uid")
        self.assertNotIn("sent to printer", reply.lower())
        return reply

    def assert_posted_once(self):
        self.client.post.assert_called_once_with(
            "AnalysisRequest/sample-uid/sticker",
            {"template": "Code_128_1x48mm.pt"},
        )

    def test_missing_sample(self):
        self.client.get_sample.return_value = None
        self.assertEqual(
            self.execute(), "Sample SA-2026-0042 not found. Cannot print label."
        )
        self.client.post.assert_not_called()

    def test_missing_api_url(self):
        for metadata in ({}, {"api_url": ""}, {"api_url": None}):
            with self.subTest(metadata=metadata):
                self.client.reset_mock()
                self.client.get_sample.return_value = {"uid": "sample-uid", **metadata}
                self.assertEqual(
                    self.execute(),
                    "Unable to request label printing for sample SA-2026-0042: missing API metadata.",
                )
                self.client.post.assert_not_called()

    def test_request_error(self):
        self.client.post.side_effect = RuntimeError("Request failed")
        with self.assertLogs("voice.commands", level="WARNING"):
            reply = self.execute()
        self.assertEqual(
            reply,
            "Label print request failed for sample SA-2026-0042. Printing is unconfirmed.",
        )
        self.assert_posted_once()

    def test_success(self):
        self.assertEqual(
            self.execute(),
            "Label print request submitted for sample SA-2026-0042. Printing is unconfirmed.",
        )
        self.assert_posted_once()


if __name__ == "__main__":
    unittest.main()
