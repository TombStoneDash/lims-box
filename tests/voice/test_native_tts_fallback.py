"""Offline regression tests for platform-native speech failure handling."""

import subprocess
import unittest
from unittest.mock import patch

from voice import tts


class NativeTTSFallbackTests(unittest.TestCase):
    def check_native_calls(self, *, returncode=0, error=None):
        text = "Technician's confirmation"
        for engine, system, executable in (
            ("sapi", "Windows", "powershell"),
            ("say", "Darwin", "say"),
        ):
            with self.subTest(engine=engine):
                def run(args, **kwargs):
                    if error is not None:
                        raise error
                    result = subprocess.CompletedProcess(args, returncode)
                    # Match subprocess.run: nonzero exits raise only with check=True.
                    if kwargs.get("check", False):
                        result.check_returncode()
                    return result

                with (
                    patch.object(tts.platform, "system", return_value=system),
                    patch.object(tts.subprocess, "run", side_effect=run) as native,
                    patch.object(tts, "_speak_console") as fallback,
                    patch.object(tts.logger, "error"),
                    patch("builtins.print") as console_print,
                ):
                    tts.speak(text, engine=engine)

                    if returncode or error is not None:
                        fallback.assert_called_once_with(text)
                    else:
                        fallback.assert_not_called()
                    console_print.assert_not_called()
                    native.assert_called_once()
                    args = native.call_args.args[0]
                    self.assertIsInstance(args, list)
                    self.assertEqual(args[0], executable)
                    self.assertIs(native.call_args.kwargs["check"], True)
                    self.assertEqual(native.call_args.kwargs["timeout"], 30)
                    self.assertFalse(native.call_args.kwargs.get("shell", False))

    def test_nonzero_exit_falls_back_once(self):
        self.check_native_calls(returncode=1)

    def test_timeout_falls_back_once(self):
        self.check_native_calls(error=subprocess.TimeoutExpired("native-tts", 30))

    def test_missing_executable_falls_back_once(self):
        self.check_native_calls(error=FileNotFoundError("native-tts"))

    def test_success_does_not_fall_back(self):
        self.check_native_calls()


if __name__ == "__main__":
    unittest.main()
