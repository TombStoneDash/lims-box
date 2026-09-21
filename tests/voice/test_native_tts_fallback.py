"""Offline regression tests for native speech and console fallback."""

import subprocess
import unittest
from unittest.mock import patch

from voice import tts


class NativeTTSFallbackTests(unittest.TestCase):
    ENGINES = (("sapi", "Windows", "powershell"), ("say", "Darwin", "say"))
    TEXT = "Synthetic sample's status is ready."

    def exercise_engines(self, *, returncode=0, error=None):
        for engine, system, executable in self.ENGINES:
            with self.subTest(engine=engine):
                def run(command, **kwargs):
                    if error is not None:
                        raise error
                    result = subprocess.CompletedProcess(command, returncode)
                    if kwargs.get("check"):
                        result.check_returncode()
                    return result

                with (
                    patch("voice.tts.platform.system", return_value=system),
                    patch("voice.tts.subprocess.run", side_effect=run) as native,
                    patch("voice.tts._speak_console") as fallback,
                    patch("voice.tts.logger") as logger,
                ):
                    tts.speak(self.TEXT, engine=engine)

                native.assert_called_once()
                args, kwargs = native.call_args
                self.assertEqual(args[0][0], executable)
                self.assertEqual(kwargs["timeout"], 30)
                if engine == "sapi":
                    self.assertEqual(args[0][1:3], ["-NoProfile", "-Command"])
                    self.assertIn("$synth.Speak('Synthetic sample''s status is ready.')", args[0][3])
                    self.assertTrue(kwargs["capture_output"])
                else:
                    self.assertEqual(args[0], ["say", "-v", "Samantha", self.TEXT])

                if error is not None or returncode:
                    fallback.assert_called_once_with(self.TEXT)
                    logger.error.assert_called_once()
                else:
                    fallback.assert_not_called()
                    logger.error.assert_not_called()

    def test_nonzero_exit_falls_back_once(self):
        self.exercise_engines(returncode=1)

    def test_missing_executable_falls_back_once(self):
        self.exercise_engines(error=FileNotFoundError("Synthetic missing executable"))

    def test_timeout_falls_back_once(self):
        self.exercise_engines(error=subprocess.TimeoutExpired("synthetic-tts", 30))

    def test_success_does_not_fall_back(self):
        self.exercise_engines()


if __name__ == "__main__":
    unittest.main()
