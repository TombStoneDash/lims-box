"""Offline regressions for spoken dash separators and literal sample IDs."""

import unittest
from unittest.mock import Mock, patch

from voice import commands


SAMPLE_IDS = (
    ("DASHER-001", "DASHER-001"),
    ("ADASHB-002", "ADASHB-002"),
    ("aDaShb-003", "ADASHB-003"),
    ("SA dash 2026 dash 0 0 1", "SA-2026-001"),
    ("sa DaSh 2026 DASH 002", "SA-2026-002"),
    ("DASHER dash 0 0 1", "DASHER-001"),
    ("SA-2026-001", "SA-2026-001"),
    ("SA-DASH-001", "SA-DASH-001"),
    ("  s a  -  2026 - 0 0 1  ", "SA-2026-001"),
    ("SA\tdash\t2026\tdash\t001", "SA-2026-001"),
)


class SampleIdDashBoundaryTests(unittest.TestCase):
    def test_normalization_preserves_literal_tokens(self):
        for raw, expected in SAMPLE_IDS:
            with self.subTest(raw=raw):
                self.assertEqual(commands._normalize_sample_id(raw), expected)

    def test_log_lookup_and_creation_use_normalized_identifier(self):
        for raw, expected in SAMPLE_IDS:
            for exists in (False, True):
                with self.subTest(raw=raw, exists=exists):
                    client = Mock(spec=commands.SenaiteClient)
                    client.get_sample.return_value = (
                        {"uid": "sample-uid"} if exists else None
                    )
                    client.create_sample.return_value = {"uid": "sample-uid"}
                    with patch.object(commands, "session", commands.SessionContext()):
                        commands.execute_command("log_sample", (raw,), client)
                    client.get_sample.assert_called_once_with(expected)
                    if exists:
                        client.create_sample.assert_not_called()
                    else:
                        client.create_sample.assert_called_once_with(expected)

    def test_label_lookup_uses_normalized_identifier(self):
        for raw, expected in SAMPLE_IDS:
            with self.subTest(raw=raw):
                client = Mock(spec=commands.SenaiteClient)
                client.get_sample.return_value = {
                    "uid": "sample-uid",
                    "api_url": "https://offline.invalid/sample",
                }
                commands.execute_command("print_label", (raw,), client)
                client.get_sample.assert_called_once_with(expected)
                client.post.assert_called_once_with(
                    "AnalysisRequest/sample-uid/sticker",
                    {"template": "Code_128_1x48mm.pt"},
                )


if __name__ == "__main__":
    unittest.main()
