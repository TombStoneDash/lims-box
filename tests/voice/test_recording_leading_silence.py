"""Offline recording regressions with simulated audio and elapsed time."""

import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch

import numpy as np


class MicrophoneError(Exception):
    pass


def load_listener():
    sounddevice = types.ModuleType("sounddevice")
    sounddevice.PortAudioError = MicrophoneError
    sounddevice.InputStream = Mock(side_effect=AssertionError("Unexpected microphone access"))
    whisper = types.ModuleType("faster_whisper")
    whisper.WhisperModel = Mock(side_effect=AssertionError("Unexpected model loading"))
    spec = importlib.util.spec_from_file_location(
        "recording_listener_under_test",
        Path(__file__).resolve().parents[2] / "voice" / "listener.py",
    )
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {"sounddevice": sounddevice, "faster_whisper": whisper}):
        spec.loader.exec_module(module)
    return module


class FakeInputStream:
    def __init__(self, source, *, fail=False):
        self.source = iter(source)
        self.fail = fail
        self.ticks = 0
        self.delivered = []
        self.closed = False

    def open(self, **kwargs):
        self.callback = kwargs["callback"]
        self.blocksize = kwargs["blocksize"]
        self.dtype = kwargs["dtype"]
        self.channels = kwargs["channels"]
        return self

    def __enter__(self):
        if self.fail:
            raise MicrophoneError("microphone unavailable")
        return self

    def __exit__(self, *args):
        self.closed = True

    def time(self):
        return self.ticks / 20

    def sleep(self, seconds):
        assert seconds == 0.05
        self.ticks += 1
        # The real stream delivers a 100 ms chunk every two polling intervals.
        if self.ticks % 2 == 0:
            chunk = np.full(
                (self.blocksize, self.channels), next(self.source, 0.0), dtype=self.dtype
            )
            self.delivered.append(chunk.copy())
            self.callback(chunk, self.blocksize, None, None)
            # InputStream may reuse its buffer after the callback returns.
            chunk.fill(-1)


class RecordingLeadingSilenceTests(unittest.TestCase):
    def setUp(self):
        self.listener = load_listener()

    def record(self, source, *, fail=False):
        stream = FakeInputStream(source, fail=fail)
        with (
            patch.object(self.listener.sd, "InputStream", side_effect=stream.open),
            patch.object(self.listener, "time", stream),
            patch.object(self.listener, "SILENCE_DURATION", 0.4),
        ):
            audio = self.listener.record_until_silence(
                sr=100, max_seconds=2.0, silence_threshold=0.25
            )
        self.assertEqual(audio.dtype, np.dtype("float32"))
        self.assertEqual(audio.ndim, 1)
        if not fail:
            self.assertTrue(stream.closed)
            np.testing.assert_array_equal(audio, np.concatenate(stream.delivered).flatten())
        return audio, stream

    def test_leading_silence_keeps_window_open_for_speech(self):
        audio, stream = self.record([0.0] * 6 + [0.5, 0.75] + [0.0] * 10)
        self.assertEqual(len(stream.delivered), 12)
        self.assertEqual(stream.time(), 1.2)
        np.testing.assert_array_equal(audio[60:80], [0.5] * 10 + [0.75] * 10)

    def test_speech_stops_after_enough_consecutive_silence(self):
        audio, stream = self.record([0.5] + [0.0] * 3 + [0.25] + [0.0] * 10)
        self.assertEqual(len(stream.delivered), 9)
        self.assertEqual(stream.time(), 0.9)
        np.testing.assert_array_equal(audio[:10], [0.5] * 10)
        np.testing.assert_array_equal(audio[40:50], [0.25] * 10)

    def test_all_silent_input_runs_until_maximum_duration(self):
        audio, stream = self.record([0.0] * 30)
        self.assertEqual(stream.time(), 2.0)
        self.assertEqual(len(stream.delivered), 20)
        np.testing.assert_array_equal(audio, np.zeros(200, dtype="float32"))

    def test_microphone_failure_returns_empty_audio(self):
        with self.assertLogs(self.listener.logger, level="ERROR") as logs:
            audio, stream = self.record([], fail=True)
        self.assertEqual(audio.size, 0)
        self.assertEqual(stream.time(), 0.0)
        self.assertIn("Microphone error: microphone unavailable", logs.output[0])


if __name__ == "__main__":
    unittest.main()
