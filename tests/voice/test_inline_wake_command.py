"""Inline wake-command regression tests without hardware or services."""

import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import Mock, patch


def load_listener():
    """Load the real listener and parser with hardware/service imports isolated."""
    imports = {}
    for name, attributes in {
        "sounddevice": {"InputStream": Mock(), "PortAudioError": type("PortAudioError", (Exception,), {})},
        "faster_whisper": {"WhisperModel": Mock()},
        "voice.tts": {"speak": Mock()},
        "voice.queue": {"CommandQueue": Mock()},
        "senaite.client": {"SenaiteClient": Mock()},
        "voice.config": {
            "WAKE_WORDS": ("hey lims", "lims box"),
            "WHISPER_MODEL": "unused", "WHISPER_DEVICE": "cpu",
            "WHISPER_COMPUTE_TYPE": "unused", "SAMPLE_RATE": 100,
            "SILENCE_THRESHOLD": 0.125, "SILENCE_DURATION": 1.5,
            "LISTEN_TIMEOUT": 10, "SENAITE_BASE_URL": "unused",
            "SENAITE_USERNAME": "unused", "SENAITE_PASSWORD": "unused",
            "QUEUE_DB": "unused",
        },
    }.items():
        imports[name] = ModuleType(name)
        vars(imports[name]).update(attributes)

    voice_path = Path(__file__).resolve().parents[2] / "voice"
    with patch.dict(sys.modules, imports):
        spec = importlib.util.spec_from_file_location("voice.commands", voice_path / "commands.py")
        commands = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(commands)
        sys.modules["voice.commands"] = commands
        spec = importlib.util.spec_from_file_location("inline_listener_under_test", voice_path / "listener.py")
        listener = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(listener)
    return listener


class InlineWakeCommandTests(unittest.TestCase):
    def setUp(self):
        self.listener = load_listener()

    def extract(self, transcript):
        wake = self.listener.contains_wake_word(transcript)
        self.assertIsNotNone(wake)
        return self.listener.extract_inline_command(transcript, wake)

    def test_separators_and_whitespace_with_both_wake_phrases(self):
        for wake in ("Hey LIMS", "LIMS Box"):
            for separator in (", ", ": ", ". ", " ", "\t , \n : . \u2003"):
                with self.subTest(wake=wake, separator=separator):
                    command = self.extract(f"  {wake}{separator}Show pending samples \t")
                    self.assertEqual(command, "Show pending samples")
                    self.assertEqual(self.listener.parse_command(command), ("show_pending", ()))

    def test_wake_only_and_punctuation_only_remainder(self):
        for wake in ("Hey LIMS", "LIMS Box"):
            for remainder in ("", " ", ",", ":", ".", " , : ... \t\n"):
                with self.subTest(wake=wake, remainder=remainder):
                    self.assertIsNone(self.extract(wake + remainder))

    def test_argument_case_and_punctuation_are_preserved(self):
        for command in (
            "Log sample AbC-12.3:Q,R",
            "Record result -1.25 for Lead: dissolved, A.B",
            'Start test "Lead, Total".',
        ):
            with self.subTest(command=command):
                self.assertEqual(self.extract("Hey LIMS, " + command), command)

    def test_unlisted_punctuation_is_not_removed(self):
        self.assertEqual(self.extract("Hey LIMS, /show pending samples"), "/show pending samples")

    def test_negative_command_still_fails_to_parse(self):
        command = self.extract("Hey LIMS, don't show pending samples")
        self.assertIsNone(self.listener.parse_command(command))

    def test_missing_wake_phrase(self):
        self.assertIsNone(self.listener.extract_inline_command("show pending samples", "hey lims"))


if __name__ == "__main__":
    unittest.main()
