"""Transcription recovery with isolated imports and local audio fixtures."""

from types import SimpleNamespace
import unittest
from unittest.mock import Mock

import numpy as np

from test_silent_transcription import load_listener


class TranscriptionRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.listener = load_listener()
        self.model = Mock()
        self.audio = np.array([0.5, -0.5], dtype="float32")

    def test_immediate_decoder_failure_returns_empty_and_logs_error(self):
        self.model.transcribe.side_effect = RuntimeError("decoder unavailable")

        with self.assertLogs("voice.listener", level="ERROR") as logs:
            result = self.listener.transcribe(self.model, self.audio)

        self.assertEqual(result, "")
        self.assertIn("Transcription failed", logs.output[0])
        self.assertIn("decoder unavailable", logs.output[0])
        self.model.transcribe.assert_called_once_with(self.audio, language="en", beam_size=3)

    def test_lazy_failure_discards_partial_command_and_next_call_succeeds(self):
        def failing_segments():
            yield SimpleNamespace(text="Hey LIMS mark complete")
            raise RuntimeError("segment decoding failed")

        self.model.transcribe.side_effect = [
            (failing_segments(), None),
            (iter(SimpleNamespace(text=text) for text in ("  Hey LIMS", "show pending samples  ")), None),
        ]

        with self.assertLogs("voice.listener", level="ERROR") as logs:
            result = self.listener.transcribe(self.model, self.audio)

        self.assertEqual(result, "")
        self.assertIn("discarding transcript", logs.output[0])
        self.assertIn("segment decoding failed", logs.output[0])
        self.assertEqual(
            self.listener.transcribe(self.model, self.audio),
            "Hey LIMS show pending samples",
        )
        self.assertEqual(self.model.transcribe.call_count, 2)

    def test_keyboard_interrupt_from_decoder_propagates(self):
        self.model.transcribe.side_effect = KeyboardInterrupt

        with self.assertRaises(KeyboardInterrupt):
            self.listener.transcribe(self.model, self.audio)

    def test_keyboard_interrupt_from_lazy_segments_propagates(self):
        def interrupted_segments():
            yield SimpleNamespace(text="Hey LIMS mark complete")
            raise KeyboardInterrupt

        self.model.transcribe.return_value = (interrupted_segments(), None)

        with self.assertRaises(KeyboardInterrupt):
            self.listener.transcribe(self.model, self.audio)


if __name__ == "__main__":
    unittest.main()
