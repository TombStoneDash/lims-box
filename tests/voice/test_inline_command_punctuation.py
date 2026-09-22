"""Offline wake/command separator regressions without hardware or services."""

import unittest

from test_recording_silence import load_listener
from voice.commands import parse_command


class InlineCommandPunctuationTests(unittest.TestCase):
    def setUp(self):
        self.listener = load_listener()
        self.listener.WAKE_WORDS = ("hey lims", "lims box")

    def extract(self, transcript):
        wake = self.listener.contains_wake_word(transcript)
        self.assertIsNotNone(wake)
        return self.listener.extract_inline_command(transcript, wake)

    def test_separators_produce_parseable_read_only_commands(self):
        for wake in ("Hey LIMS", "LIMS Box"):
            for separator in (", ", ": ", ". ", "! ", "? ", "; ", "... ", "… ", "— ", ",", ":", " \t: ,\n", " ", "\t\n"):
                with self.subTest(wake=wake, separator=separator):
                    command = self.extract(wake + separator + "Show pending samples.  ")
                    self.assertEqual(command, "Show pending samples.")
                    self.assertEqual(parse_command(command), ("show_pending", ()))

    def test_punctuation_only_suffix_keeps_second_listening_available(self):
        for wake in ("Hey LIMS", "LIMS Box"):
            for suffix in ("", " \t\n", ",", ":", "....", "!?!?", " : , ; . ! ? ", "… — …"):
                with self.subTest(wake=wake, suffix=suffix):
                    self.assertIsNone(self.extract(wake + suffix))

    def test_command_case_spacing_and_argument_punctuation_are_preserved(self):
        for wake in ("Hey LIMS", "LIMS Box"):
            for command in (
                "Log sample SA-2026-0042",
                "Log sample Sa-please_0042/A:B.7",
                "Print label for Sa-0042.",
                "Start test pH-like,  Calcium: Total",
                "Record result 4.2 for pH",
            ):
                with self.subTest(wake=wake, command=command):
                    self.assertEqual(self.extract(wake + ": " + command + " \t"), command)

    def test_separator_removal_does_not_relax_affirmative_parser(self):
        for command in ("do not show pending samples", "I said show pending samples yesterday"):
            with self.subTest(command=command):
                extracted = self.extract("Hey LIMS, " + command)
                self.assertEqual(extracted, command)
                self.assertIsNone(parse_command(extracted))

    def test_missing_wake_phrase_returns_no_command(self):
        self.assertIsNone(self.listener.extract_inline_command("Show pending samples", "hey lims"))


if __name__ == "__main__":
    unittest.main()
