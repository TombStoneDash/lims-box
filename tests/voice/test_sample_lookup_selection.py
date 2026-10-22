"""Offline regression tests for safe sample lookup selection."""

from collections import UserDict
import unittest
from unittest.mock import patch

from senaite.client import SenaiteClient


class SampleLookupSelectionTests(unittest.TestCase):
    MALFORMED = (
        None, "sample-1", 123, [], {}, {"uid": None}, {"uid": ""},
        {"uid": " \t\n"}, {"uid": 123}, {"uid": False}, {"uid": []},
        {"uid": {}},
    )
    DUPLICATES = (
        [{"uid": "sample-1"}, {"uid": "sample-2"}],
        [{"uid": "sample-1"}, {"uid": "sample-1"}],
    )

    def setUp(self):
        self.client = SenaiteClient("https://example.invalid", "fixture", "fixture")
        for name, response in (
            ("search_samples", []),
            ("get", {"items": [{"uid": "analysis-1", "parent_uid": "sample-1"}]}),
            ("post", {"success": True}),
        ):
            mock = patch.object(self.client, name, return_value=response)
            setattr(self, name, mock.start())
            self.addCleanup(mock.stop)

    def test_empty_search_returns_none(self):
        self.assertIsNone(self.client.get_sample("SA-001"))
        self.search_samples.assert_called_once_with(query="SA-001", review_state="")

    def test_single_valid_mapping_is_returned_unchanged(self):
        for sample in ({"uid": "sample-1", "title": "Sample"},
                       UserDict({"uid": "sample-1"}), {"uid": " sample-1 "}):
            with self.subTest(sample=sample):
                self.search_samples.return_value = [sample]
                self.assertIs(self.client.get_sample("SA-001"), sample)

    def test_duplicate_matches_raise_clear_error(self):
        for items in self.DUPLICATES:
            with self.subTest(items=items):
                self.search_samples.return_value = items
                with self.assertRaisesRegex(ValueError, "Multiple samples match sample SA-001"):
                    self.client.get_sample("SA-001")

    def test_malformed_singleton_raises_clear_error(self):
        for sample in self.MALFORMED:
            with self.subTest(sample=sample):
                self.search_samples.return_value = [sample]
                with self.assertRaisesRegex(ValueError, "Sample SA-001 has an invalid UID"):
                    self.client.get_sample("SA-001")

    def test_invalid_lookup_prevents_both_callers_from_writing(self):
        invalid_results = [[], *self.DUPLICATES, *([sample] for sample in self.MALFORMED)]
        for items in invalid_results:
            for method, args in (
                (self.client.record_result, ("SA-001", "pH", "7")),
                (self.client.transition_sample, ("SA-001", "submit")),
            ):
                with self.subTest(items=items, method=method.__name__):
                    self.search_samples.return_value = items
                    with self.assertRaises(ValueError):
                        method(*args)
                    self.get.assert_not_called()
                    self.post.assert_not_called()

    def test_mismatching_identity_prevents_both_callers_from_writing(self):
        for field in ("getId", "id"):
            for identity in ("SYNTH-B", "synth-a", " SYNTH-A ", "", None, 123):
                sample = {"uid": "uid-b", field: identity}
                if field == "getId":
                    # A matching fallback must not hide an explicit getId mismatch.
                    sample["id"] = "SYNTH-A"
                for method, args in (
                    (self.client.record_result, ("SYNTH-A", "pH", "7")),
                    (self.client.transition_sample, ("SYNTH-A", "submit")),
                ):
                    with self.subTest(field=field, identity=identity, method=method.__name__):
                        self.search_samples.return_value = [sample]
                        with self.assertRaisesRegex(
                            ValueError,
                            f"Sample lookup for 'SYNTH-A' returned mismatching {field}:",
                        ):
                            method(*args)
                        self.get.assert_not_called()
                        self.post.assert_not_called()

    def test_valid_lookup_preserves_both_callers_posts(self):
        for identity in ({}, {"getId": "SA-001"}, {"id": "SA-001"},
                         {"getId": "SA-001", "id": "SA-001"}):
            with self.subTest(identity=identity):
                self.get.reset_mock()
                self.post.reset_mock()
                sample = {"uid": "sample-1", **identity}
                self.search_samples.return_value = [sample]
                self.assertIs(self.client.get_sample("SA-001"), sample)
                self.assertIs(self.client.record_result("SA-001", "pH", "7"), self.post.return_value)
                self.get.assert_called_once_with("Analysis?getParentUID=sample-1&getKeyword=pH")
                self.post.assert_called_once_with("Analysis/analysis-1", {"Result": "7"})
                self.post.reset_mock()
                self.assertIs(self.client.transition_sample("SA-001", "submit"), self.post.return_value)
                self.post.assert_called_once_with("AnalysisRequest/sample-1/transition/submit", {})


if __name__ == "__main__":
    unittest.main()
