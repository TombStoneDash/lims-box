"""Offline regression tests for literal SENAITE query parameter values."""

import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from senaite.client import SenaiteClient


class SenaiteQueryEncodingTests(unittest.TestCase):
    VALUES = ("SA-001", "SA 001", "SA+001", "SA&A=1", "SA#001", "水-é001")

    def setUp(self):
        self.client = SenaiteClient("https://example.invalid", "fixture", "fixture")

    def assert_query(self, endpoint, path, expected):
        parsed = urlsplit(endpoint)
        self.assertEqual(parsed.path, path)
        self.assertEqual(parsed.fragment, "")
        self.assertEqual(
            parse_qs(parsed.query, keep_blank_values=True),
            {key: [str(value)] for key, value in expected.items()},
        )

    def test_search_values_round_trip(self):
        items = [{"uid": "sample-uid"}]
        for value in self.VALUES:
            with self.subTest(value=value), patch.object(
                self.client, "get", return_value={"items": items}
            ) as get:
                self.assertIs(
                    self.client.search_samples(value, review_state=value, limit=7), items
                )
                get.assert_called_once()
                self.assert_query(get.call_args.args[0], "AnalysisRequest", {
                    "review_state": value, "sort_on": "created",
                    "sort_order": "descending", "limit": 7, "getId": value,
                })

    def test_search_defaults_and_missing_items(self):
        with patch.object(self.client, "get", return_value={}) as get:
            self.assertEqual(self.client.search_samples(), [])
            get.assert_called_once_with(
                "AnalysisRequest?review_state=sample_received"
                "&sort_on=created&sort_order=descending&limit=25"
            )

    def test_record_result_round_trips_and_preserves_payload(self):
        value = "12.3 + & # µg/L"
        response = {"success": True}
        for literal in self.VALUES:
            with self.subTest(literal=literal), patch.object(
                self.client, "get", side_effect=[
                    {"items": [{"uid": literal}]},
                    {"items": [{"uid": "chosen-analysis"}]},
                ]
            ) as get, patch.object(
                self.client, "post", return_value=response
            ) as post:
                self.assertIs(self.client.record_result(literal, literal, value), response)
                self.assertEqual(get.call_count, 2)
                self.assert_query(get.call_args_list[0].args[0], "AnalysisRequest", {
                    "review_state": "", "sort_on": "created",
                    "sort_order": "descending", "limit": 25, "getId": literal,
                })
                self.assert_query(get.call_args_list[1].args[0], "Analysis", {
                    "getParentUID": literal, "getKeyword": literal,
                })
                post.assert_called_once_with("Analysis/chosen-analysis", {"Result": value})

    def test_record_result_missing_sample_or_analysis(self):
        for responses, message in (
            ([{}], "Sample SA-001 not found"),
            ([{"items": [{"uid": "sample-uid"}]}, {}],
             "Test 'pH' not found on sample SA-001"),
        ):
            with self.subTest(message=message), patch.object(
                self.client, "get", side_effect=responses
            ), patch.object(self.client, "post") as post:
                with self.assertRaises(ValueError) as caught:
                    self.client.record_result("SA-001", "pH", "7")
                self.assertEqual(str(caught.exception), message)
                post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
