"""Offline regression tests for unambiguous parent sample selection."""

import unittest
from unittest.mock import patch

from senaite.client import SenaiteClient


class SampleTargetSelectionTests(unittest.TestCase):
    def setUp(self):
        self.client = SenaiteClient("https://example.invalid", "fixture", "fixture")
        for name, response in (
            ("search_samples", []),
            ("get", {"items": [{"uid": "analysis-1"}]}),
            ("post", {"success": True}),
        ):
            mock = patch.object(self.client, name, return_value=response)
            setattr(self, name, mock.start())
            self.addCleanup(mock.stop)

    def assert_selection_rejected(self, message):
        for method, args in (
            (self.client.get_sample, ("SA-001",)),
            (self.client.record_result, ("SA-001", "pH", "7")),
            (self.client.transition_sample, ("SA-001", "submit")),
        ):
            with self.subTest(method=method.__name__):
                with self.assertRaisesRegex(ValueError, message):
                    method(*args)
                self.post.assert_not_called()
                self.get.assert_not_called()

    def test_empty_search_preserves_none_and_callers_do_not_write(self):
        self.assertIsNone(self.client.get_sample("SA-001"))
        self.search_samples.assert_called_once_with(query="SA-001", review_state="")
        for method, args in (
            (self.client.record_result, ("SA-001", "pH", "7")),
            (self.client.transition_sample, ("SA-001", "submit")),
        ):
            with self.subTest(method=method.__name__):
                with self.assertRaisesRegex(ValueError, "Sample SA-001 not found"):
                    method(*args)
                self.post.assert_not_called()
                self.get.assert_not_called()

    def test_single_valid_sample_returned_unchanged(self):
        for uid in ("sample-1", " sample-1 "):
            with self.subTest(uid=uid):
                sample = {"uid": uid, "title": "Original sample"}
                self.search_samples.return_value = [sample]
                self.assertIs(self.client.get_sample("SA-001"), sample)
                self.assertEqual(sample, {"uid": uid, "title": "Original sample"})
                self.search_samples.assert_called_with(query="SA-001", review_state="")

    def test_multiple_samples_rejected_without_writing(self):
        for second_uid in ("sample-2", "sample-1"):
            with self.subTest(second_uid=second_uid):
                self.search_samples.return_value = [{"uid": "sample-1"}, {"uid": second_uid}]
                self.assert_selection_rejected("Multiple samples.*ambiguous")

    def test_malformed_sample_rejected_without_writing(self):
        for sample in (None, "sample-1", [], 123, {}, {"uid": ""},
                       {"uid": " \t\n"}, {"uid": None}, {"uid": 123},
                       {"uid": False}, {"uid": []}, {"uid": {}}):
            with self.subTest(sample=sample):
                self.search_samples.return_value = [sample]
                self.assert_selection_rejected("malformed metadata: invalid UID")

    def test_valid_sample_allows_result_and_transition_posts(self):
        self.search_samples.return_value = [{"uid": "sample-1"}]
        result = self.client.record_result("SA-001", "pH", "7")
        self.assertIs(result, self.post.return_value)
        self.get.assert_called_once_with("Analysis?getParentUID=sample-1&getKeyword=pH")
        self.post.assert_called_once_with("Analysis/analysis-1", {"Result": "7"})
        self.post.reset_mock()

        result = self.client.transition_sample("SA-001", "submit")
        self.assertIs(result, self.post.return_value)
        self.post.assert_called_once_with("AnalysisRequest/sample-1/transition/submit", {})


if __name__ == "__main__":
    unittest.main()
