"""Parsing-only regression tests; no client or command execution."""

import unittest

from voice.commands import parse_command


class NegatedCommandTests(unittest.TestCase):
    def test_negated_commands_are_rejected(self):
        for command in (
            "mark sample complete",
            "mark complete",
            "log sample SA-2026-0042",
            "record result 4.2 for pH",
        ):
            for prefix in (
                "do not ", "don't ", "don’t ", "never ", "not ", "no, ",
                "please do not ", "okay, please don't ",
                "DO NOT PLEASE ", "um uh so never ",
            ):
                with self.subTest(command=command, prefix=prefix):
                    self.assertIsNone(parse_command(prefix + command))

    def test_commands_embedded_in_other_speech_are_rejected(self):
        for utterance in (
            "I said do not mark sample complete",
            "remember to log sample SA-2026-0042",
            "we should record result 4.2 for pH",
        ):
            with self.subTest(utterance=utterance):
                self.assertIsNone(parse_command(utterance))

    def test_documented_affirmative_commands(self):
        for utterance, expected in (
            ("Log sample SA-2026-0042", ("log_sample", ("SA-2026-0042",))),
            ("Start test turbidity", ("start_test", ("turbidity",))),
            ("Record result 4.2 for pH", ("record_result", ("4.2", "pH"))),
            ("Show pending samples", ("show_pending", ())),
            ("Mark sample complete", ("mark_complete", ())),
            ("Print label for SA-2026-0042", ("print_label", ("SA-2026-0042",))),
            ("mark complete", ("mark_complete", ())),
        ):
            for prefix in ("", "please ", "okay, please ", "um uh like so "):
                with self.subTest(utterance=utterance, prefix=prefix):
                    self.assertEqual(parse_command(prefix + utterance), expected)

    def test_case_whitespace_and_argument_values_are_preserved(self):
        for utterance, expected in (
            ("  PlEaSe LoG\tSaMpLe SA-2026-0042  ",
             ("log_sample", ("SA-2026-0042",))),
            ("ReCoRd ReSuLt -4.2 FoR pH", ("record_result", ("-4.2", "pH"))),
            ("start test Salt like  Na+", ("start_test", ("Salt like  Na+",))),
            ("record result not detected for pH",
             ("record_result", ("not detected", "pH"))),
            ("PLEASE MARK SAMPLE COMPLETE", ("mark_complete", ())),
        ):
            with self.subTest(utterance=utterance):
                self.assertEqual(parse_command(utterance), expected)


if __name__ == "__main__":
    unittest.main()
