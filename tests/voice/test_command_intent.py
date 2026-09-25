"""Offline parser-only regressions for affirmative voice command intent."""

import unittest

from voice.commands import parse_command


class CommandIntentTests(unittest.TestCase):
    AFFIRMATIVE_COMMANDS = (
        ("Log sample SA-2026-0042", ("log_sample", ("SA-2026-0042",))),
        ("Start test turbidity", ("start_test", ("turbidity",))),
        ("Record result 4.2 for pH", ("record_result", ("4.2", "pH"))),
        ("Show pending samples", ("show_pending", ())),
        ("Mark sample complete", ("mark_complete", ())),
        ("Print label for SA-2026-0042", ("print_label", ("SA-2026-0042",))),
        ("Mark complete", ("mark_complete", ())),
    )

    def test_affirmative_forms_with_leading_fillers_and_punctuation(self):
        for transcript, expected in self.AFFIRMATIVE_COMMANDS:
            for prefix in ("", "please ", "okay ", "Okay, please ", "Um, uh so "):
                for suffix in ("", ".", "!", "?", "..."):
                    with self.subTest(transcript=transcript, prefix=prefix, suffix=suffix):
                        self.assertEqual(
                            parse_command("  " + prefix + transcript + suffix + "  "),
                            expected,
                        )

    def test_command_words_are_case_insensitive(self):
        for transcript, expected in (
            ("lOg SaMpLe SA-001", ("log_sample", ("SA-001",))),
            ("START TEST pH", ("start_test", ("pH",))),
            ("RECORD RESULT 4.2 FoR pH", ("record_result", ("4.2", "pH"))),
            ("SHOW PENDING SAMPLES", ("show_pending", ())),
            ("MARK SAMPLE COMPLETE", ("mark_complete", ())),
            ("PRINT LABEL FOR SA-001", ("print_label", ("SA-001",))),
        ):
            with self.subTest(transcript=transcript):
                self.assertEqual(parse_command(transcript), expected)

    def test_negated_prefixes_are_rejected(self):
        for transcript, _ in self.AFFIRMATIVE_COMMANDS:
            for negation in ("do not ", "don't ", "never ", "DO NOT "):
                for filler in ("", "please ", "Okay, please "):
                    with self.subTest(transcript=transcript, negation=negation, filler=filler):
                        self.assertIsNone(parse_command(filler + negation + transcript))

    def test_embedded_commands_and_incomplete_commands_are_rejected(self):
        for transcript in (
            "I said mark sample complete yesterday",
            "I said log sample SA-001 yesterday",
            "please I said mark sample complete yesterday",
            "mark sample complete yesterday",
            "show pending samples tomorrow",
            "okay-do not mark sample complete",
            "please-mark sample complete",
            "log sample",
            "start test",
            "record result 4.2 for",
            "",
            "please",
        ):
            with self.subTest(transcript=transcript):
                self.assertIsNone(parse_command(transcript))

    def test_argument_contents_are_preserved(self):
        for transcript, expected in (
            ("log sample SA-please-001", ("log_sample", ("SA-please-001",))),
            ("start test so like please okay um uh", ("start_test", ("so like please okay um uh",))),
            ("start test Never  Like pH", ("start_test", ("Never  Like pH",))),
            ("record result not detected for pH-like", ("record_result", ("not detected", "pH-like"))),
            ("print label for okay-SA-001", ("print_label", ("okay-SA-001",))),
        ):
            with self.subTest(transcript=transcript):
                self.assertEqual(parse_command(transcript), expected)


if __name__ == "__main__":
    unittest.main()
