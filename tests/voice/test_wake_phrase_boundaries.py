"""Wake phrase boundaries without microphones, models, databases, or services."""

import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

import numpy as np  # Load before patching sys.modules so native imports persist.


def load_listener():
    """Load only the listener, with fail-fast stubs for external operations."""
    def forbidden(*args, **kwargs):
        raise AssertionError("External operations are forbidden in listener tests")

    imports = {}
    for name, attributes in {
        "sounddevice": {
            "InputStream": Mock(side_effect=forbidden),
            "PortAudioError": type("PortAudioError", (Exception,), {}),
        },
        "faster_whisper": {"WhisperModel": Mock(side_effect=forbidden)},
        "voice.commands": {
            "parse_command": Mock(side_effect=forbidden),
            "execute_command": Mock(side_effect=forbidden),
        },
        "voice.tts": {"speak": Mock(side_effect=forbidden)},
        "voice.queue": {"CommandQueue": Mock(side_effect=forbidden)},
        "senaite.client": {"SenaiteClient": Mock(side_effect=forbidden)},
        "voice.config": {
            "WAKE_WORDS": ("hey lims",), "WHISPER_MODEL": "unused",
            "WHISPER_DEVICE": "cpu", "WHISPER_COMPUTE_TYPE": "unused",
            "SAMPLE_RATE": 100, "SILENCE_THRESHOLD": 0.125,
            "SILENCE_DURATION": 1.5, "LISTEN_TIMEOUT": 10,
            "SENAITE_BASE_URL": "unused", "SENAITE_USERNAME": "unused",
            "SENAITE_PASSWORD": "unused", "QUEUE_DB": "unused",
        },
    }.items():
        imports[name] = ModuleType(name)
        vars(imports[name]).update(attributes)
    path = Path(__file__).resolve().parents[2] / "voice" / "listener.py"
    with patch.dict(sys.modules, imports):
        spec = importlib.util.spec_from_file_location("boundary_listener_under_test", path)
        listener = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(listener)
    return listener


class WakePhraseBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.listener = load_listener()

    def test_embedded_prefixes_and_suffixes_are_rejected(self):
        for phrase in (
            "they lims", "xhey lims", "hey limsy", "hey lims2",
            "2hey lims", "_hey lims", "hey lims_", "éhey lims", "hey limsé",
        ):
            with self.subTest(phrase=phrase):
                text = f"{phrase} show pending samples"
                self.assertIsNone(self.listener.contains_wake_word(text))
                self.assertIsNone(self.listener.extract_inline_command(text, "hey lims"))

    def test_standalone_and_mixed_case_phrases(self):
        for phrase in ("hey lims", "Hey LIMS", "hEy LiMs"):
            for prefix in ("", "please ", "(", "!", "—"):
                with self.subTest(phrase=phrase, prefix=prefix):
                    text = f"{prefix}{phrase}"
                    self.assertEqual(self.listener.contains_wake_word(text), "hey lims")
                    self.assertIsNone(self.listener.extract_inline_command(text, "hey lims"))
                    self.assertEqual(
                        self.listener.extract_inline_command(text + " show pending samples", "hey lims"),
                        "show pending samples",
                    )

    def test_separators_preserve_argument_punctuation(self):
        command = "Log sample Sa-2026:aB.001,rev-A"
        for separator in (" ", ", ", ":", ". ", "-", "–", "—", " \t, : . —\n"):
            with self.subTest(separator=separator):
                text = f"Hey LIMS{separator}{command}  "
                self.assertEqual(self.listener.contains_wake_word(text), "hey lims")
                self.assertEqual(self.listener.extract_inline_command(text, "hey lims"), command)

    def test_false_substring_before_valid_phrase_is_skipped(self):
        for false_phrase in ("they lims", "hey limsy"):
            with self.subTest(false_phrase=false_phrase):
                text = f"{false_phrase} ignore this; HEY LIMS: Show pending samples"
                self.assertEqual(self.listener.contains_wake_word(text), "hey lims")
                self.assertEqual(
                    self.listener.extract_inline_command(text, "hey lims"),
                    "Show pending samples",
                )

    def test_configured_phrases_are_case_insensitive_literals(self):
        for phrase, nonliteral in (("Hey LIMS", "they lims"), ("hey l.ms+", "hey limss")):
            with self.subTest(phrase=phrase), patch.object(self.listener, "WAKE_WORDS", (phrase,)):
                text = f"{phrase.upper()}: show pending samples"
                self.assertEqual(self.listener.contains_wake_word(text), phrase)
                self.assertEqual(
                    self.listener.extract_inline_command(text, phrase), "show pending samples"
                )
                for invalid in (nonliteral, "x" + phrase, phrase + "x"):
                    text = invalid + " show pending samples"
                    self.assertIsNone(self.listener.contains_wake_word(text))
                    self.assertIsNone(self.listener.extract_inline_command(text, phrase))


if __name__ == "__main__":
    unittest.main()
