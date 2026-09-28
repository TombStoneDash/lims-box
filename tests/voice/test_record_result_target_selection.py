"""Offline regression tests for unambiguous result targets."""

import unittest
from unittest.mock import patch

from senaite.client import SenaiteClient


class RecordResultTargetSelectionTests(unittest.TestCase):
    def setUp(self):
        self.client = SenaiteClient("https://example.invalid", "fixture", "fixture")
        for name, response in (
            ("get_sample", {"uid": "sample-uid"}),
            ("get", {"items": []}),
            ("post", {"success": True}),
        ):
            mock = patch.object(self.client, name, return_value=response)
            setattr(self, name, mock.start())
            self.addCleanup(mock.stop)

    def test_zero_matches_preserves_not_found_error_without_writing(self):
        with self.assertRaises(ValueError) as caught:
            self.client.record_result("SA-001", "pH", "7")
        self.assertEqual(str(caught.exception), "Test 'pH' not found on sample SA-001")
        self.post.assert_not_called()

    def test_multiple_distinct_matches_rejected_without_writing(self):
        self.get.return_value = {"items": [{"uid": "analysis-1"}, {"uid": "analysis-2"}]}
        with self.assertRaisesRegex(ValueError, "Multiple analyses match test 'pH'"):
            self.client.record_result("SA-001", "pH", "7")
        self.post.assert_not_called()

    def test_malformed_sole_target_rejected_without_writing(self):
        for target in ({}, {"uid": None}, {"uid": ""}, {"uid": " \t"},
                       {"uid": 123}, {"uid": False}, {"uid": []}, None, "analysis-1"):
            with self.subTest(target=target):
                self.get.return_value = {"items": [target]}
                with self.assertRaisesRegex(ValueError, "has an invalid UID"):
                    self.client.record_result("SA-001", "pH", "7")
                self.post.assert_not_called()

    def test_one_valid_match_preserves_endpoint_and_result_body(self):
        self.get.return_value = {"items": [{"uid": "analysis-1"}]}
        value = "12.3 + & # µg/L"
        response = self.client.record_result("SA-001", "pH", value)
        self.get_sample.assert_called_once_with("SA-001")
        self.get.assert_called_once_with("Analysis?getParentUID=sample-uid&getKeyword=pH")
        self.post.assert_called_once_with("Analysis/analysis-1", {"Result": value})
        self.assertIs(response, self.post.return_value)


if __name__ == "__main__":
    unittest.main()
