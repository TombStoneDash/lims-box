"""Deterministic transcription tests without microphones, models, or services."""

import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import numpy as np


def load_listener():
    """Load the actual listener with all hardware/service imports isolated."""
    imports = {}
    for name, attributes in {
        "sounddevice": {"InputStream": Mock(), "PortAudioError": type("PortAudioError", (Exception,), {})},
        "faster_whisper": {"WhisperModel": Mock()},
        "voice.commands": {"parse_command": Mock(), "execute_command": Mock()},
        "voice.tts": {"speak": Mock()},
        "voice.queue": {"CommandQueue": Mock()},
        "senaite.client": {"SenaiteClient": Mock()},
        "voice.config": {
            "WAKE_WORDS": (), "WHISPER_MODEL": "unused", "WHISPER_DEVICE": "cpu",
            "WHISPER_COMPUTE_TYPE": "unused", "SAMPLE_RATE": 16000,
            "SILENCE_THRESHOLD": 0.125, "SILENCE_DURATION": 1.5,
            "LISTEN_TIMEOUT": 10, "SENAITE_BASE_URL": "unused",
            "SENAITE_USERNAME": "unused", "SENAITE_PASSWORD": "unused",
            "QUEUE_DB": "unused",
        },
    }.items():
        imports[name] = ModuleType(name)
        vars(imports[name]).update(attributes)
    path = Path(__file__).resolve().parents[2] / "voice" / "listener.py"
    spec = importlib.util.spec_from_file_location("silent_transcription_listener_under_test", path)
    listener = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, imports):
        spec.loader.exec_module(listener)
    return listener


class SilentTranscriptionTests(unittest.TestCase):
    def setUp(self):
        self.listener = load_listener()
        self.model = Mock()
        self.model.transcribe.return_value = (
            iter([SimpleNamespace(text="Hey LIMS mark complete")]), None,
        )

    def test_empty_audio_skips_model(self):
        self.assertEqual(self.listener.transcribe(self.model, np.array([], dtype="float32")), "")
        self.model.transcribe.assert_not_called()

    def test_zero_filled_audio_skips_model(self):
        for zero in (0.0, -0.0):
            with self.subTest(zero=zero):
                audio = np.full(16000, zero, dtype="float32")
                self.assertEqual(self.listener.transcribe(self.model, audio), "")
                self.model.transcribe.assert_not_called()

    def test_nonzero_quiet_audio_calls_model_once(self):
        for sample in (np.finfo(np.float32).smallest_subnormal, -np.finfo(np.float32).smallest_subnormal):
            with self.subTest(sample=sample):
                audio = np.zeros(16000, dtype="float32")
                audio[8000] = sample
                model = Mock()
                model.transcribe.return_value = ([SimpleNamespace(text="quiet speech")], None)
                self.assertEqual(self.listener.transcribe(model, audio), "quiet speech")
                model.transcribe.assert_called_once_with(audio, language="en", beam_size=3)
                self.assertIs(model.transcribe.call_args.args[0], audio)

    def test_segment_joining_and_trimming_are_unchanged(self):
        audio = np.array([0.5, -0.5], dtype="float32")
        self.model.transcribe.return_value = (
            iter(SimpleNamespace(text=text) for text in ("  Hey LIMS", "mark", "complete  ")),
            None,
        )
        self.assertEqual(self.listener.transcribe(self.model, audio), "Hey LIMS mark complete")
        self.model.transcribe.assert_called_once_with(audio, language="en", beam_size=3)


if __name__ == "__main__":
    unittest.main()
