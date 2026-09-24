"""Native speech regression tests; no real speech processes are launched."""

import subprocess
import unittest
from unittest.mock import patch

from voice import tts


class NativeSpeechTests(unittest.TestCase):
    text = "Sample 'A' confirmed."
    engines = (("sapi", "Windows"), ("say", "Darwin"))

    def assert_native_call(self, run, engine):
        if engine == "sapi":
            run.assert_called_once_with(
                [
                    "powershell", "-NoProfile", "-Command",
                    "Add-Type -AssemblyName System.Speech; "
                    "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                    "$synth.Rate = 1; "
                    "$synth.Speak('Sample ''A'' confirmed.')",
                ],
                check=True, capture_output=True, timeout=30,
            )
        else:
            run.assert_called_once_with(
                ["say", "-v", "Samantha", self.text], check=True, timeout=30,
            )

    def test_nonzero_exit_falls_back_once(self):
        def failed_run(args, **kwargs):
            result = subprocess.CompletedProcess(args, 1)
            if kwargs.get("check"):
                result.check_returncode()
            return result

        for engine, system in self.engines:
            with self.subTest(engine=engine), \
                    patch("voice.tts.platform.system", return_value=system), \
                    patch("voice.tts.subprocess.run", side_effect=failed_run) as run, \
                    patch("voice.tts._speak_console") as console, \
                    self.assertLogs("voice.tts", level="ERROR"):
                tts.speak(self.text, engine=engine)
                console.assert_called_once_with(self.text)
                self.assert_native_call(run, engine)

    def test_success_does_not_fall_back(self):
        for engine, system in self.engines:
            with self.subTest(engine=engine), \
                    patch("voice.tts.platform.system", return_value=system), \
                    patch("voice.tts.subprocess.run", return_value=
                          subprocess.CompletedProcess([], 0)) as run, \
                    patch("voice.tts._speak_console") as console:
                tts.speak(self.text, engine=engine)
                console.assert_not_called()
                self.assert_native_call(run, engine)

    def test_timeout_falls_back_once(self):
        for engine, system in self.engines:
            with self.subTest(engine=engine), \
                    patch("voice.tts.platform.system", return_value=system), \
                    patch("voice.tts.subprocess.run", side_effect=
                          subprocess.TimeoutExpired(engine, 30)) as run, \
                    patch("voice.tts._speak_console") as console, \
                    self.assertLogs("voice.tts", level="ERROR"):
                tts.speak(self.text, engine=engine)
                console.assert_called_once_with(self.text)
                self.assert_native_call(run, engine)


if __name__ == "__main__":
    unittest.main()
