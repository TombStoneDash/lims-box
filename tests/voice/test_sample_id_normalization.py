"""Offline helper-only regressions for spoken sample identifiers."""

import unittest

from voice.commands import _normalize_sample_id


class SampleIdNormalizationTests(unittest.TestCase):
    def test_dash_in_identifiers_is_preserved(self):
        for raw, expected in (
            ("DASHBOARD-001", "DASHBOARD-001"),
            ("DASH-001", "DASH-001"),
            ("aDaShB-001", "ADASHB-001"),
            ("daShboard-001", "DASHBOARD-001"),
            ("SA-dAsH-001", "SA-DASH-001"),
            ("SA-DASH 001", "SA-DASH001"),
            ("SA DASH-001", "SADASH-001"),
            ("dash001", "DASH001"),
            ("001dash", "001DASH"),
        ):
            with self.subTest(raw=raw):
                self.assertEqual(_normalize_sample_id(raw), expected)

    def test_standalone_spoken_separators(self):
        for raw, expected in (
            ("SA dash 2026 dash 0 0 1", "SA-2026-001"),
            (" sa DaSh 2026 DASH 0 0 1 ", "SA-2026-001"),
            ("SA dash dash 001", "SA--001"),
            ("SA\tdAsH\t2026\ndash\n001", "SA-2026-001"),
            ("dash SA dash", "-SA-"),
        ):
            with self.subTest(raw=raw):
                self.assertEqual(_normalize_sample_id(raw), expected)

    def test_ordinary_identifiers_and_existing_cleanup(self):
        for raw, expected in (
            ("SA-2026-001", "SA-2026-001"),
            ("abc123", "ABC123"),
            ("  sa001  ", "SA001"),
            ("S A 0 0 1", "SA001"),
            ("  sa  -  2026 - 0 0 1  ", "SA-2026-001"),
            ("SA\t-\n001", "SA-001"),
            ("", ""),
        ):
            with self.subTest(raw=raw):
                self.assertEqual(_normalize_sample_id(raw), expected)


if __name__ == "__main__":
    unittest.main()
