"""Inline wake phrase regressions without microphones, models, or services."""

import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

import numpy as np  # Load before patching sys.modules so native imports persist.


def load_listener():
    """Isolate listener dependencies while retaining the real command parser."""
    imports = {}
    for name, attributes in {
        "sounddevice": {"InputStream": Mock(), "PortAudioError": type("PortAudioError", (Exception,), {})},
        "faster_whisper": {"WhisperModel": Mock()},
        "voice.tts": {"speak": Mock()},
        "voice.queue": {"CommandQueue": Mock()},
        "senaite.client": {"SenaiteClient": Mock()},
        "voice.config": {
            "WAKE_WORDS": ("hey lims",), "WHISPER_MODEL": "unused", "WHISPER_DEVICE": "cpu",
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
        for name in ("commands", "listener"):
            spec = importlib.util.spec_from_file_location(
                f"inline_{name}_under_test", voice_dir / f"{name}.py"
            )
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            if name == "commands":
                sys.modules["voice.commands"] = module
    return module


class InlineWakePunctuationTests(unittest.TestCase):
    def setUp(self):
        self.listener = load_listener()

    def extract(self, transcript):
        wake = self.listener.contains_wake_word(transcript)
        self.assertEqual(wake, "hey lims")
        return self.listener.extract_inline_command(transcript, wake)

    def test_separators_and_mixed_case_wake_phrases(self):
        for wake in ("Hey LIMS", "hEy LiMs"):
            for separator in (", ", ":", ". ", " - ", " – ", " — ", " \t, : . —\n"):
                with self.subTest(wake=wake, separator=separator):
                    command = self.extract(f"{wake}{separator}Show pending samples  ")
                    self.assertEqual(command, "Show pending samples")
                    self.assertEqual(self.listener.parse_command(command), ("show_pending", ()))

    def test_wake_only_returns_none(self):
        for suffix in ("", " \t", ",", ":", ".", "-", "–", "—", " , : . - – — \t"):
            with self.subTest(suffix=suffix):
                self.assertIsNone(self.extract(f"Hey LIMS{suffix}"))

    def test_unpunctuated_command(self):
        command = self.extract("Hey LIMS show pending samples")
        self.assertEqual(command, "show pending samples")
        self.assertEqual(self.listener.parse_command(command), ("show_pending", ()))

    def test_argument_punctuation_and_case_survive(self):
        for sample_id in ("Sa-2026-aB-001", "Sa-2026:aB.001,rev-A"):
            with self.subTest(sample_id=sample_id):
                command = self.extract(f"Hey LIMS, Log sample {sample_id}")
                self.assertEqual(command, f"Log sample {sample_id}")
                self.assertEqual(self.listener.parse_command(command), ("log_sample", (sample_id,)))

    def test_missing_wake_phrase(self):
        self.assertIsNone(self.listener.extract_inline_command("show pending samples", "hey lims"))


if __name__ == "__main__":
    unittest.main()
