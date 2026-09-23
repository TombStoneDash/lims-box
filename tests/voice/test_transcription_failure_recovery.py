"""Transcription failure recovery without hardware, models, or live services."""

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
    spec = importlib.util.spec_from_file_location("transcription_failure_listener_under_test", path)
    listener = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, imports):
        spec.loader.exec_module(listener)
    return listener


class TranscriptionFailureRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.listener = load_listener()
        self.audio = np.array([0.5, -0.5], dtype="float32")

    def failing_segments(self, error):
        yield SimpleNamespace(text="private partial transcript")
        raise error

    def test_failures_discard_text_and_next_transcription_succeeds(self):
        for deferred in (False, True):
            for error_type in (RuntimeError, ValueError):
                with self.subTest(deferred=deferred, error_type=error_type):
                    error = error_type("private audio or transcription details")
                    failure = (self.failing_segments(error), None) if deferred else error
                    model = Mock()
                    model.transcribe.side_effect = [
                        failure,
                        (iter([SimpleNamespace(text="  next"), SimpleNamespace(text="capture  ")]), None),
                    ]
                    with self.assertLogs(self.listener.logger, level="ERROR") as logs:
                        self.assertEqual(self.listener.transcribe(model, self.audio), "")
                    self.assertEqual(len(logs.records), 1)
                    record = logs.records[0]
                    self.assertIn("Transcription failed", record.getMessage())
                    self.assertNotIn("private", record.getMessage())
                    self.assertNotIn(str(self.audio), record.getMessage())
                    self.assertIsNone(record.exc_info)
                    self.assertIsNone(record.stack_info)
                    model.transcribe.assert_called_once_with(self.audio, language="en", beam_size=3)
                    self.assertEqual(self.listener.transcribe(model, self.audio), "next capture")
                    self.assertEqual(model.transcribe.call_count, 2)

    def test_shutdown_exceptions_propagate(self):
        for error_type in (KeyboardInterrupt, SystemExit):
            for deferred in (False, True):
                with self.subTest(error_type=error_type, deferred=deferred):
                    error = error_type()
                    model = Mock()
                    if deferred:
                        model.transcribe.return_value = (self.failing_segments(error), None)
                    else:
                        model.transcribe.side_effect = error
                    with self.assertRaises(error_type) as raised:
                        self.listener.transcribe(model, self.audio)
                    self.assertIs(raised.exception, error)

    def test_empty_and_silent_audio_skip_model(self):
        for audio in (np.array([], dtype="float32"), np.zeros(16, dtype="float32")):
            with self.subTest(size=audio.size):
                model = Mock()
                model.transcribe.side_effect = RuntimeError("must not be called")
                self.assertEqual(self.listener.transcribe(model, audio), "")
                model.transcribe.assert_not_called()


if __name__ == "__main__":
    unittest.main()
