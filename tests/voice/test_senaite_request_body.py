"""Offline regression tests for SENAITE JSON request bodies."""

import json
import unittest
from unittest.mock import patch
from urllib.request import Request

from senaite.client import SenaiteClient


class SenaiteRequestBodyTests(unittest.TestCase):
    def setUp(self):
        self.client = SenaiteClient("https://example.invalid", "fixture", "fixture")
        transport = patch("senaite.client.urlopen")
        self.urlopen = transport.start()
        self.addCleanup(transport.stop)
        self.urlopen.return_value.__enter__.return_value.read.return_value = b'{}'

    def assert_request(self, method, endpoint):
        self.urlopen.assert_called_once()
        request = self.urlopen.call_args.args[0]
        self.assertIsInstance(request, Request)
        self.urlopen.assert_called_once_with(request, timeout=10)
        self.assertEqual(request.get_method(), method)
        self.assertEqual(request.full_url, f"{self.client.api_url}/{endpoint}")
        self.assertEqual(request.get_header("Content-type"), "application/json")
        return request

    def test_empty_post_payload_is_json_object(self):
        self.client.post("AnalysisRequest", {})

        request = self.assert_request("POST", "AnalysisRequest")
        self.assertEqual(request.data, b"{}")
        self.assertEqual(json.loads(request.data.decode("utf-8")), {})

    def test_populated_post_payload_preserves_values(self):
        payload = {"getId": "synthetic-é001", "count": 2, "enabled": True}
        self.client.post("AnalysisRequest", payload)

        request = self.assert_request("POST", "AnalysisRequest")
        self.assertIsInstance(request.data, bytes)
        self.assertEqual(request.data, json.dumps(payload).encode("utf-8"))
        self.assertEqual(json.loads(request.data.decode("utf-8")), payload)

    def test_get_without_data_has_no_body(self):
        self.client.get("version")

        request = self.assert_request("GET", "version")
        self.assertIsNone(request.data)

    def test_transition_sample_sends_empty_json_object(self):
        with patch.object(
            self.client, "get_sample", return_value={"uid": "synthetic-sample-uid"}
        ) as lookup:
            self.client.transition_sample("synthetic-sample-001", "submit")

        lookup.assert_called_once_with("synthetic-sample-001")
        request = self.assert_request(
            "POST", "AnalysisRequest/synthetic-sample-uid/transition/submit"
        )
        self.assertEqual(request.data, b"{}")
        self.assertEqual(json.loads(request.data.decode("utf-8")), {})


if __name__ == "__main__":
    unittest.main()
