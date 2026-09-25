"""Deterministic recording tests without microphones, models, or services."""

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
            "WHISPER_COMPUTE_TYPE": "unused", "SAMPLE_RATE": 100,
            "SILENCE_THRESHOLD": 0.125, "SILENCE_DURATION": 1.5,
            "LISTEN_TIMEOUT": 10, "SENAITE_BASE_URL": "unused",
            "SENAITE_USERNAME": "unused", "SENAITE_PASSWORD": "unused",
            "QUEUE_DB": "unused",
        },
    }.items():
        imports[name] = ModuleType(name)
        vars(imports[name]).update(attributes)
    path = Path(__file__).resolve().parents[2] / "voice" / "listener.py"
    spec = importlib.util.spec_from_file_location("recording_listener_under_test", path)
    listener = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, imports):
        spec.loader.exec_module(listener)
    return listener


class FakeCapture:
    """Emit one 100 ms audio block every two 50 ms clock ticks."""

    def __init__(self, levels, *, emit=True, fail_at=None, error_type=RuntimeError):
        self.levels = levels
        self.emit = emit
        self.fail_at = fail_at
        self.error_type = error_type
        self.ticks = 0
        self.blocks = 0
        self.closed = False

    def time(self):
        return self.ticks / 20

    def sleep(self, seconds):
        assert seconds == 0.05
        self.ticks += 1
        if self.fail_at is not None and self.ticks == self.fail_at:
            raise self.error_type("fake microphone failure")
        if self.emit and self.ticks % 2 == 0:
            level = self.levels(self.blocks)
            data = np.full((self.blocksize, 1), level, dtype="float32")
            self.callback(data, self.blocksize, None, None)
            self.blocks += 1
            # A device can reuse its callback buffer; captured chunks must be copies.
            data.fill(-1)

    def stream(self, **kwargs):
        assert kwargs["channels"] == 1
        assert kwargs["dtype"] == "float32"
        assert kwargs["blocksize"] == int(kwargs["samplerate"] * 0.1)
        self.callback = kwargs["callback"]
        self.blocksize = kwargs["blocksize"]
        return self

    def __enter__(self):
        if self.fail_at == 0:
            raise self.error_type("fake microphone open failure")
        return self

    def __exit__(self, *args):
        self.closed = True


class RecordingSilenceTests(unittest.TestCase):
    def setUp(self):
        self.listener = load_listener()

    def record(self, levels, **kwargs):
        capture = FakeCapture(levels, error_type=self.listener.sd.PortAudioError, **kwargs)
        with (
            patch.object(self.listener.sd, "InputStream", side_effect=capture.stream),
            patch.object(self.listener, "time", SimpleNamespace(time=capture.time, sleep=capture.sleep)),
        ):
            audio = self.listener.record_until_silence()
        self.assertEqual(audio.dtype, np.dtype("float32"))
        self.assertEqual(audio.ndim, 1)
        return capture, audio

    def test_initial_silence_survives_until_later_speech(self):
        capture, audio = self.record(lambda i: 0.5 if 25 <= i < 28 else 0)
        self.assertEqual(capture.blocks, 43)
        self.assertEqual(capture.time(), 4.3)
        np.testing.assert_array_equal(audio, np.repeat([0] * 25 + [0.5] * 3 + [0] * 15, 10))
        self.assertTrue(capture.closed)

    def test_speech_then_trailing_silence_stops_capture(self):
        # Equality with the threshold must count as speech.
        capture, audio = self.record(lambda i: 0.125 if i == 0 else 0)
        self.assertEqual(capture.blocks, 16)
        self.assertEqual(capture.time(), 1.6)
        self.assertEqual(audio.size, 160)

    def test_more_speech_resets_trailing_silence(self):
        capture, _ = self.record(lambda i: 0.5 if i in (0, 10) else 0)
        self.assertEqual(capture.blocks, 26)

    def test_continuous_silence_reaches_timeout(self):
        capture, audio = self.record(lambda i: 0)
        self.assertEqual(capture.time(), 10)
        self.assertEqual(audio.size, 1000)
        self.assertTrue(np.all(audio == 0))

    def test_continuous_speech_is_bounded_by_timeout(self):
        capture, audio = self.record(lambda i: 0.5)
        self.assertEqual(capture.time(), 10)
        self.assertEqual(audio.size, 1000)
        self.assertTrue(np.all(audio == 0.5))

    def test_no_callbacks_returns_empty_audio(self):
        capture, audio = self.record(lambda i: 0, emit=False)
        self.assertEqual(capture.time(), 10)
        self.assertEqual(audio.size, 0)

    def test_microphone_errors_return_empty_audio(self):
        for fail_at in (0, 5):
            with self.subTest(fail_at=fail_at), self.assertLogs(self.listener.logger, level="ERROR") as logs:
                capture, audio = self.record(lambda i: 0.5, fail_at=fail_at)
                self.assertEqual(audio.size, 0)
                self.assertIn("Microphone error:", logs.output[0])
                if fail_at:
                    self.assertGreater(capture.blocks, 0)
                    self.assertTrue(capture.closed)


if __name__ == "__main__":
    unittest.main()
