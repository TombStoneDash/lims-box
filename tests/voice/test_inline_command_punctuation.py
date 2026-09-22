"""Inline wake phrase regressions without microphones, models, or services."""

import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

import numpy as np  # Load before patch.dict restores sys.modules.


def load_listener():
    """Load the actual listener and parser with hardware/service imports stubbed."""
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

    voice_dir = Path(__file__).resolve().parents[2] / "voice"
    with patch.dict(sys.modules, imports):
        spec = importlib.util.spec_from_file_location("voice.commands", voice_dir / "commands.py")
        commands = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(commands)
        sys.modules["voice.commands"] = commands
        spec = importlib.util.spec_from_file_location("inline_listener_under_test", voice_dir / "listener.py")
        listener = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(listener)
    return listener


class InlineCommandPunctuationTests(unittest.TestCase):
    def setUp(self):
        self.listener = load_listener()

    def extract(self, text):
        wake = self.listener.contains_wake_word(text)
        self.assertIsNotNone(wake)
        return self.listener.extract_inline_command(text, wake)

    def test_leading_separators_and_plain_commands(self):
        for wake in ("Hey LIMS", "LIMS Box", "hEy LiMs", "LiMs bOx"):
            for separator in (" ", ", ", ": ", "; ", ". ", "! ", "? ", ",", " \t, : .!?;\n"):
                with self.subTest(wake=wake, separator=separator):
                    command = self.extract(wake + separator + "ShOw pending samples")
                    self.assertEqual(command, "ShOw pending samples")
                    self.assertEqual(self.listener.parse_command(command), ("show_pending", ()))

    def test_empty_or_punctuation_only_remainder_listens_for_command(self):
        for wake in ("Hey LIMS", "LIMS Box"):
            for remainder in ("", "   ", ",", ":", ".!?", " \t, : ; . ! ?\n"):
                with self.subTest(wake=wake, remainder=remainder):
                    self.assertIsNone(self.extract(wake + remainder))

    def test_negation_is_preserved_and_rejected(self):
        command = self.extract("Hey LIMS, do not mark sample complete")
        self.assertEqual(command, "do not mark sample complete")
        self.assertIsNone(self.listener.parse_command(command))

    def test_argument_spelling_and_punctuation_are_preserved(self):
        for command, parsed in (
            ("Log sample Sa-2026/A:01,B", ("log_sample", ("Sa-2026/A:01,B",))),
            ("Record result -4.2 for pH: water, batch-A", ("record_result", ("-4.2", "pH: water, batch-A"))),
            ("Start test Alpha! Beta? Gamma; Delta", ("start_test", ("Alpha! Beta? Gamma; Delta",))),
        ):
            with self.subTest(command=command):
                extracted = self.extract("LIMS Box: " + command)
                self.assertEqual(extracted, command)
                self.assertEqual(self.listener.parse_command(extracted), parsed)


if __name__ == "__main__":
    unittest.main()
