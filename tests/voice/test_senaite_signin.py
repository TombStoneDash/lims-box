"""A rejected SENAITE login must never read as an empty lab (no network access).

SENAITE 2.6 answers bad credentials with HTTP 200, treats the caller as
Anonymous, and returns empty sample listings. The identity answers below are
the real SENAITE 2.6.0 recordings in tests/senaite-read/fixtures/recorded.
"""

import json
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from senaite.client import SenaiteClient
from voice import commands
from voice.queue import _confirmed_success

RECORDED = json.loads((Path(__file__).resolve().parents[1] / "senaite-read" / "fixtures"
                       / "recorded" / "senaite-2.6.0-anonymous.json").read_text())


def recorded(name):
    return json.loads(RECORDED["responses"][name]["bodyText"])


ANONYMOUS = recorded("users-current-invalid-bearer")
EMPTY_LISTING = recorded("analysisrequest-invalid-bearer")
SIGNED_IN = {"items": [{"username": "synthetic-reader", "authenticated": True}]}


class SenaiteSignInTests(unittest.TestCase):
    def setUp(self):
        self.client = SenaiteClient("https://senaite.recorded.invalid/senaite", "reader", "wrong")

    def server(self, identity):
        calls = []

        def get(endpoint):
            calls.append(endpoint.split("?")[0])
            return identity if endpoint == "users/current" else EMPTY_LISTING
        return calls, get

    def test_recording_is_the_hazard(self):
        self.assertEqual([EMPTY_LISTING["count"], EMPTY_LISTING["items"]], [0, []])
        self.assertEqual([item["authenticated"] for item in ANONYMOUS["items"]], [False])

    def test_rejected_login_is_an_error_not_an_empty_read(self):
        for read in (self.client.get_pending_samples, self.client.search_samples,
                     lambda: self.client.get_sample("SA-001")):
            calls, get = self.server(ANONYMOUS)
            with self.subTest(read=read), patch.object(self.client, "get", side_effect=get):
                with self.assertRaises(PermissionError):
                    read()
                self.assertEqual(calls, ["AnalysisRequest", "users/current"])

    def test_signed_in_empty_reads_stay_empty(self):
        for read, expected in ((self.client.get_pending_samples, []),
                               (self.client.search_samples, []),
                               (lambda: self.client.get_sample("SA-001"), None)):
            _, get = self.server(SIGNED_IN)
            with self.subTest(read=read), patch.object(self.client, "get", side_effect=get):
                self.assertEqual(read(), expected)

    def test_malformed_identity_answers_fail_closed(self):
        for identity in ({}, {"items": []}, {"items": [{}]}, {"items": [{"authenticated": "true"}]},
                         {"items": [SIGNED_IN["items"][0], SIGNED_IN["items"][0]]}, [], None):
            _, get = self.server(identity)
            with self.subTest(identity=identity), patch.object(self.client, "get", side_effect=get):
                with self.assertRaises(ValueError):
                    self.client.get_pending_samples()

    def test_nonempty_reads_need_no_identity_call(self):
        page = {"items": [{"uid": "u-1", "review_state": "sample_received"}], "count": 1, "next": None}
        with patch.object(self.client, "get", return_value=page) as get:
            self.assertEqual(self.client.get_pending_samples(), [{"uid": "u-1", "review_state": "sample_received"}])
        get.assert_called_once()

    def test_voice_never_says_no_pending_samples_after_a_rejected_login(self):
        _, get = self.server(ANONYMOUS)
        with patch.object(self.client, "get", side_effect=get):
            spoken = commands.execute_command("show_pending", (), self.client)
        self.assertNotEqual(spoken, "No pending samples.")
        self.assertIn("did not accept the configured credentials", spoken)
        self.assertFalse(_confirmed_success("show_pending", spoken))

    def test_log_sample_does_not_create_after_a_rejected_login(self):
        _, get = self.server(ANONYMOUS)
        with patch.object(commands, "session", commands.SessionContext()), \
                patch.object(self.client, "get", side_effect=get), \
                patch.object(self.client, "post") as post:
            spoken = commands.execute_command("log_sample", ("SA-001",), self.client)
        post.assert_not_called()
        self.assertFalse(_confirmed_success("log_sample", spoken))


if __name__ == "__main__":
    unittest.main()
