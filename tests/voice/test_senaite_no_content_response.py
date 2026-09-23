"""Offline regression tests for SENAITE HTTP response decoding."""

import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from senaite.client import SenaiteClient


class SenaiteNoContentResponseTests(unittest.TestCase):
    def setUp(self):
        self.client = SenaiteClient("https://example.invalid", "fixture", "fixture")
        transport = patch("senaite.client.urlopen")
        self.urlopen = transport.start()
        self.addCleanup(transport.stop)
        self.response = self.urlopen.return_value.__enter__.return_value

    def test_204_empty_body_returns_empty_dictionary(self):
        self.response.status = 204
        self.response.read.return_value = b""

        self.assertEqual(self.client.post("AnalysisRequest", {}), {})

        self.urlopen.assert_called_once()

    def test_normal_json_response_is_decoded(self):
        for status in (200, 201, 202):
            with self.subTest(status=status):
                self.urlopen.reset_mock()
                self.response.status = status
                self.response.read.return_value = b'{"uid": "synthetic-001"}'

                self.assertEqual(
                    self.client.post("AnalysisRequest", {}),
                    {"uid": "synthetic-001"},
                )

                self.urlopen.assert_called_once()

    def test_non_204_invalid_json_raises(self):
        for status in (200, 201, 202):
            for body in (b"", b"not json"):
                with self.subTest(status=status, body=body):
                    self.urlopen.reset_mock()
                    self.response.status = status
                    self.response.read.return_value = body

                    with self.assertRaises(json.JSONDecodeError):
                        self.client.post("AnalysisRequest", {})

                    self.urlopen.assert_called_once()

    def test_http_and_network_errors_propagate(self):
        errors = (
            HTTPError("https://example.invalid", 500, "fixture error", {}, None),
            URLError("fixture network error"),
            TimeoutError("fixture timeout"),
        )
        for error in errors:
            with self.subTest(error=type(error).__name__):
                self.urlopen.reset_mock()
                self.urlopen.side_effect = error

                with self.assertRaises(type(error)) as raised:
                    self.client.post("AnalysisRequest", {})

                self.assertIs(raised.exception, error)
                self.urlopen.assert_called_once()


if __name__ == "__main__":
    unittest.main()
