"""Offline regression tests for literal start-test query values."""

import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from voice import commands


class FakeClient:
    def __init__(self, uid):
        self.uid = uid
        self.lookups = []
        self.queries = []

    def get_sample(self, sample_id):
        self.lookups.append(sample_id)
        return {"uid": self.uid}

    def get(self, endpoint):
        self.queries.append(endpoint)
        return {"items": [{"review_state": "sample_received"}]}


class StartTestQueryEncodingTests(unittest.TestCase):
    def test_query_values_round_trip(self):
        for uid, test_name in (
            ("sample-uid", "pH"),
            ("sample-uid", "A&B"),
            ("sample-uid", "Total Nitrogen"),
            ("sample-uid", "Na+"),
            ("sample-uid", "水-é"),
            ("sample-uid", "Test#1"),
            ("sample&uid=1 +/#?%é", "pH"),
        ):
            with self.subTest(uid=uid, test_name=test_name):
                client = FakeClient(uid)
                context = commands.SessionContext()
                context.set_sample("SA-001", "cached-uid")
                with patch.object(commands, "session", context):
                    feedback = commands.execute_command(
                        "start_test", (test_name,), client
                    )

                self.assertEqual(client.lookups, ["SA-001"])
                self.assertEqual(len(client.queries), 1)
                parsed = urlsplit(client.queries[0])
                self.assertEqual(parsed.path, "Analysis")
                self.assertEqual(parsed.fragment, "")
                self.assertEqual(
                    parse_qs(parsed.query, keep_blank_values=True),
                    {"getParentUID": [uid], "getKeyword": [test_name]},
                )
                self.assertEqual(
                    feedback,
                    f"Test {test_name} started on sample SA-001. Awaiting results.",
                )
                self.assertEqual(context.current_sample_id, "SA-001")
                self.assertEqual(context.current_sample_uid, "cached-uid")

    def test_no_current_sample_skips_client(self):
        client = FakeClient("sample-uid")
        context = commands.SessionContext()
        with patch.object(commands, "session", context):
            feedback = commands.execute_command("start_test", ("A&B",), client)

        self.assertEqual(
            feedback,
            "No current sample. Say 'log sample' first to set the active sample.",
        )
        self.assertEqual(client.lookups, [])
        self.assertEqual(client.queries, [])
        self.assertIsNone(context.current_sample_id)
        self.assertIsNone(context.current_sample_uid)


if __name__ == "__main__":
    unittest.main()
