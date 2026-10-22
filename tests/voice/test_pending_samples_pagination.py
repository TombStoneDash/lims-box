"""Synthetic SENAITE JSONAPI batching regressions (no network access)."""

import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

from senaite.client import SenaiteClient


class PendingSamplesPaginationTests(unittest.TestCase):
    def setUp(self):
        self.client = SenaiteClient("https://example.invalid/senaite", "test", "test")
        self.records = [{"uid": f"sample-{i}", "review_state": "sample_received"}
                        for i in range(60)]

    def page(self, start, stop, count, next_start=None):
        return {
            "items": self.records[start:stop], "count": count,
            "pagesize": 25, "page": start // 25 + 1,
            "pages": max(1, (count + 24) // 25),
            "next": (None if next_start is None else
                     f"{self.client.api_url}/AnalysisRequest?b_start={next_start}"),
        }

    def test_complete_collections_use_supported_offsets_and_keep_filters(self):
        for count in (0, 1, 25, 30, 50, 60):
            with self.subTest(count=count):
                offsets = []

                def server(endpoint):
                    url = urlsplit(endpoint)
                    self.assertEqual(url.path, "AnalysisRequest")
                    query = parse_qs(url.query)
                    start = int(query["b_start"][0])
                    self.assertEqual(query, {
                        "review_state": ["sample_received"], "sort_on": ["created"],
                        "sort_order": ["descending"], "limit": ["25"],
                        "b_start": [str(start)],
                    })
                    offsets.append(start)
                    stop = min(start + 25, count)
                    return self.page(start, stop, count, stop if stop < count else None)

                with patch.object(self.client, "get", side_effect=server):
                    result = self.client.get_pending_samples()
                self.assertEqual(result, self.records[:count])
                self.assertEqual(len({item["uid"] for item in result}), count)
                self.assertEqual(offsets, list(range(0, count, 25)) or [0])

    def test_sample_outside_the_pending_state_is_rejected(self):
        # A dropped review_state filter must not list every sample as pending.
        for state in ("verified", "published", None):
            with self.subTest(state=state):
                self.records[1] = {"uid": "sample-1", "review_state": state}
                if state is None:
                    self.records[1] = {"uid": "sample-1"}
                with patch.object(self.client, "get", return_value=self.page(0, 3, 3)):
                    with self.assertRaises(ValueError):
                        self.client.get_pending_samples()

    def test_repeated_or_skipped_cursor_is_rejected(self):
        for offset in (0, 24, 26):
            with self.subTest(offset=offset), patch.object(
                self.client, "get", return_value=self.page(0, 25, 30, offset)
            ) as get:
                with self.assertRaises(ValueError):
                    self.client.get_pending_samples()
                self.assertEqual(get.call_count, 1)

    def test_repeated_page_or_overlapping_records_are_rejected(self):
        for second in (self.page(0, 25, 60, 50), self.page(24, 29, 30)):
            with self.subTest(second=second), patch.object(
                self.client, "get", side_effect=[
                    self.page(0, 25, second["count"], 25), second,
                ]
            ) as get:
                with self.assertRaisesRegex(ValueError, "Repeated pending sample"):
                    self.client.get_pending_samples()
                self.assertEqual(get.call_count, 2)

    def test_later_page_error_propagates(self):
        error = HTTPError("https://example.invalid", 503, "fixture", {}, None)
        with patch.object(self.client, "get", side_effect=[
            self.page(0, 25, 30, 25), error,
        ]) as get:
            with self.assertRaises(HTTPError) as caught:
                self.client.get_pending_samples()
            self.assertIs(caught.exception, error)
            self.assertEqual(get.call_count, 2)

    def test_incomplete_changed_or_stalled_collection_is_rejected(self):
        for second in (
            self.page(25, 29, 30), self.page(25, 30, 31),
            self.page(25, 25, 30, 25), self.page(25, 31, 30),
            self.page(25, 30, 30, 30),
        ):
            with self.subTest(second=second), patch.object(
                self.client, "get", side_effect=[self.page(0, 25, 30, 25), second]
            ):
                with self.assertRaises(ValueError):
                    self.client.get_pending_samples()

    def test_missing_or_malformed_metadata_is_rejected(self):
        valid = self.page(0, 1, 1)
        invalid = [None, {}, {"items": []}]
        for key in ("items", "count", "next"):
            invalid.append({k: v for k, v in valid.items() if k != key})
        for key, value in (("items", {}), ("count", True), ("count", -1),
                           ("count", "1"), ("items", [{}]),
                           ("items", [{"uid": " "}])):
            invalid.append(dict(valid, **{key: value}))
        for response in invalid:
            with self.subTest(response=response), patch.object(
                self.client, "get", return_value=response
            ):
                with self.assertRaises(ValueError):
                    self.client.get_pending_samples()

    def test_invalid_next_links_are_rejected_before_another_request(self):
        for link in ("", 25, "?page=2", "?b_start=-1", "?b_start=25&b_start=25",
                     "https://other.invalid/AnalysisRequest?b_start=25",
                     "Analysis?b_start=25", "?b_start=25#fragment"):
            response = self.page(0, 25, 30, 25)
            response["next"] = link
            with self.subTest(link=link), patch.object(
                self.client, "get", return_value=response
            ) as get:
                with self.assertRaises(ValueError):
                    self.client.get_pending_samples()
                self.assertEqual(get.call_count, 1)

    def test_relative_next_link_is_supported(self):
        first = self.page(0, 25, 30, 25)
        first["next"] = "?b_start=25"
        with patch.object(self.client, "get", side_effect=[first, self.page(25, 30, 30)]):
            self.assertEqual(self.client.get_pending_samples(), self.records[:30])

    def test_generic_search_and_exact_lookup_remain_single_requests(self):
        for lookup in (False, True):
            with self.subTest(lookup=lookup), patch.object(
                self.client, "get", return_value=self.page(0, 1, 30, 25)
            ) as get:
                result = (self.client.get_sample("SA-001") if lookup
                          else self.client.search_samples())
                self.assertEqual(result, self.records[0] if lookup else self.records[:1])
                get.assert_called_once()
                query = parse_qs(urlsplit(get.call_args.args[0]).query,
                                 keep_blank_values=True)
                self.assertEqual(query["limit"], ["25"])
                self.assertNotIn("b_start", query)
                self.assertEqual(query["review_state"], ["" if lookup else "sample_received"])
                if lookup:
                    self.assertEqual(query["getId"], ["SA-001"])


if __name__ == "__main__":
    unittest.main()
