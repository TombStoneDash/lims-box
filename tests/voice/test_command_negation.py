"""Parser-only regressions; no execution or external services are used."""

import unittest

from voice.commands import parse_command


class CommandNegationTests(unittest.TestCase):
    EXAMPLES = (
        ("Log sample SA-2026-0042", ("log_sample", ("sa-2026-0042",))),
        ("Start test turbidity", ("start_test", ("turbidity",))),
        ("Record result 4.2 for pH", ("record_result", ("4.2", "ph"))),
        ("Show pending samples", ("show_pending", ())),
        ("Mark sample complete", ("mark_complete", ())),
        ("Print label for SA-2026-0042", ("print_label", ("sa-2026-0042",))),
    )

    def test_negation_for_every_action(self):
        for command, _ in self.EXAMPLES:
            for negation in ("don't", "do not", "never", "don’t", "DO NOT", "do\t not"):
                for prefix in ("", "Okay, please "):
                    text = f"{prefix}{negation} {command}."
                    with self.subTest(text=text):
                        self.assertIsNone(parse_command(text))

    def test_negation_after_command(self):
        for command, _ in self.EXAMPLES:
            text = f"{command}, but don't do it yet"
            with self.subTest(text=text):
                self.assertIsNone(parse_command(text))

    def test_embedded_commands_are_not_instructions(self):
        for command, _ in self.EXAMPLES:
            for template in (
                "The technician said to {}",
                "I heard someone say {} yesterday.",
                "Please explain how to {}",
                "We should discuss this. {}",
            ):
                text = template.format(command)
                with self.subTest(text=text):
                    self.assertIsNone(parse_command(text))

    def test_readme_affirmatives_case_filler_and_punctuation(self):
        for command, expected in self.EXAMPLES:
            for prefix in ("", "Please ", "Okay, um, uh, like, so, please "):
                for ending in ("", ".", "!", "?", ",", ";", ":"):
                    text = f"  {prefix}{command.upper()}{ending}  "
                    with self.subTest(text=text):
                        self.assertEqual(parse_command(text), expected)

    def test_existing_variants_and_argument_extraction(self):
        examples = (
            ("mark complete", ("mark_complete", ())),
            ("show pending sample", ("show_pending", ())),
            ("print label SA-2026-0042", ("print_label", ("sa-2026-0042",))),
            ("log sample SA dash 2026 dash 0 0 4 2", ("log_sample", ("sa dash 2026 dash 0 0 4 2",))),
            ("record result -4.2 mg/L for dissolved oxygen.", ("record_result", ("-4.2 mg/l", "dissolved oxygen"))),
            ("start test neverland", ("start_test", ("neverland",))),
            ("start test do nothing", ("start_test", ("do nothing",))),
            ("start test water like control", ("start_test", ("water like control",))),
            ("log   sample   SA-2026-0042", ("log_sample", ("sa-2026-0042",))),
        )
        for text, expected in examples:
            with self.subTest(text=text):
                self.assertEqual(parse_command(text), expected)

    def test_incomplete_or_extra_text(self):
        for text in (
            "", "Please", "log sample", "log sample .", "start test",
            "record result 4.2", "record result 4.2 for", "print label",
            "mark sample complete later", "show pending samples tomorrow",
            "mark please sample complete", "show pending samplesextra",
        ):
            with self.subTest(text=text):
                self.assertIsNone(parse_command(text))


if __name__ == "__main__":
    unittest.main()
