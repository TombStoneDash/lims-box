"""Offline recording regressions using simulated microphone callbacks and time."""

import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

import numpy as np


class RecordingInitialSilenceTests(unittest.TestCase):
    def setUp(self):
        # Load a private module so stubs cannot leak into other voice tests.
        dependencies = {}
        for name, attributes in {
            "sounddevice": ("InputStream",),
            "faster_whisper": ("WhisperModel",),
            "voice.commands": ("parse_command", "execute_command"),
            "voice.tts": ("speak",),
            "voice.queue": ("CommandQueue",),
            "senaite.client": ("SenaiteClient",),
        }.items():
            module = ModuleType(name)
            for attribute in attributes:
                setattr(module, attribute, Mock(side_effect=AssertionError(
                    f"Unexpected dependency use: {name}.{attribute}"
                )))
            dependencies[name] = module
        dependencies["sounddevice"].PortAudioError = type(
            "PortAudioError", (Exception,), {}
        )
        path = Path(__file__).resolve().parents[2] / "voice" / "listener.py"
        spec = importlib.util.spec_from_file_location("_recording_listener_test", path)
        self.listener = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, dependencies):
            spec.loader.exec_module(self.listener)

    def record(self, levels, max_seconds=2):
        ticks = 0
        emitted = []
        callback = None

        def open_stream(**kwargs):
            nonlocal callback
            self.assertEqual(kwargs["blocksize"], 10)
            self.assertEqual(kwargs["samplerate"], 100)
            self.assertEqual(kwargs["channels"], 1)
            self.assertEqual(kwargs["dtype"], "float32")
            callback = kwargs["callback"]
            return unittest.mock.MagicMock()

        def sleep(seconds):
            nonlocal ticks
            self.assertEqual(seconds, 0.05)
            ticks += 1
            # One 100 ms microphone chunk per two polling intervals.
            if ticks % 2 == 0:
                index = len(emitted)
                level = levels[index] if index < len(levels) else 0.0
                chunk = np.full((10, 1), level, dtype="float32")
                emitted.append(chunk.copy())
                callback(chunk, 10, None, None)
                chunk.fill(-1)  # The callback must retain its own copy.

        clock = Mock()
        clock.time.side_effect = lambda: ticks * 0.05
        clock.sleep.side_effect = sleep
        with (
            patch.object(self.listener.sd, "InputStream", side_effect=open_stream),
            patch.object(self.listener, "time", clock),
            patch.object(self.listener, "SILENCE_DURATION", 0.4),
        ):
            audio = self.listener.record_until_silence(
                sr=100, max_seconds=max_seconds, silence_threshold=0.5
            )
        self.assertEqual(audio.dtype, np.dtype("float32"))
        self.assertEqual(audio.ndim, 1)
        np.testing.assert_array_equal(audio, np.concatenate(emitted).flatten())
        return audio, ticks * 0.05

    def test_initial_silence_then_speech_and_trailing_silence(self):
        levels = [0.0] * 6 + [1.0] * 2 + [0.0] * 4
        audio, elapsed = self.record(levels)
        self.assertEqual(len(audio), 120)
        self.assertAlmostEqual(elapsed, 1.2)
        np.testing.assert_array_equal(audio[60:80], np.ones(20))

    def test_all_silent_recording_reaches_timeout(self):
        audio, elapsed = self.record([0.0] * 20)
        self.assertEqual(len(audio), 200)
        self.assertEqual(elapsed, 2.0)
        self.assertFalse(audio.any())

    def test_immediate_speech_stops_after_trailing_silence(self):
        # Equality is speech under the existing RMS threshold comparison.
        audio, elapsed = self.record([0.5] + [0.0] * 4)
        self.assertEqual(len(audio), 50)
        self.assertEqual(elapsed, 0.5)

    def test_continuous_speech_still_reaches_hard_timeout(self):
        audio, elapsed = self.record([1.0] * 20)
        self.assertEqual(len(audio), 200)
        self.assertEqual(elapsed, 2.0)

    def test_microphone_error_returns_empty_audio(self):
        with (
            patch.object(self.listener.sd, "InputStream", side_effect=
                         self.listener.sd.PortAudioError("offline microphone error")),
            self.assertLogs(self.listener.logger, level="ERROR") as logs,
        ):
            audio = self.listener.record_until_silence()
        self.assertEqual(audio.size, 0)
        self.assertEqual(audio.dtype, np.dtype("float32"))
        self.assertIn("Microphone error", logs.output[0])


if __name__ == "__main__":
    unittest.main()
