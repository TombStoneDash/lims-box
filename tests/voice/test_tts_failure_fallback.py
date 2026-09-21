"""TTS failure regression tests; every subprocess is mocked."""

import subprocess
import unittest
from unittest.mock import Mock, call, patch

from voice import tts


class TTSFailureFallbackTests(unittest.TestCase):
    text = "Patient's sample is ready."

    def setUp(self):
        self.platform = self.enterContext(patch.object(tts.platform, "system"))
        self.run = self.enterContext(patch.object(tts.subprocess, "run"))
        self.popen = self.enterContext(patch.object(tts.subprocess, "Popen"))
        self.print = self.enterContext(patch("builtins.print"))
        self.enterContext(patch.object(tts.logger, "error"))
        self.platform.return_value = "Linux"
        self.run.side_effect = AssertionError("Unexpected subprocess.run")
        self.popen.side_effect = AssertionError("Unexpected subprocess.Popen")

    def assert_fallback(self):
        self.print.assert_called_once_with(f"  [LIMS BOX]: {self.text}")

    def process(self, command, returncode=0, audio=b"audio"):
        proc = Mock(args=[command], returncode=returncode)
        proc.communicate.return_value = (audio, None)
        return proc

    def native_call(self, engine, system, returncode=0):
        self.platform.return_value = system

        def run(command, **kwargs):
            result = subprocess.CompletedProcess(command, returncode)
            if kwargs.get("check"):
                result.check_returncode()
            return result

        self.run.side_effect = run
        tts.speak(self.text, engine=engine)

    def test_native_success_preserves_arguments(self):
        for engine, system in (("sapi", "Windows"), ("say", "Darwin")):
            with self.subTest(engine=engine):
                self.run.reset_mock()
                self.native_call(engine, system)
                if engine == "say":
                    command = ["say", "-v", "Samantha", self.text]
                    self.run.assert_called_once_with(command, check=True, timeout=30)
                else:
                    command = ["powershell", "-NoProfile", "-Command",
                               "Add-Type -AssemblyName System.Speech; "
                               "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                               "$synth.Rate = 1; "
                               "$synth.Speak('Patient''s sample is ready.')"]
                    self.run.assert_called_once_with(
                        command, check=True, capture_output=True, timeout=30)
                self.print.assert_not_called()
                self.popen.assert_not_called()

    def test_native_nonzero_falls_back_once(self):
        for engine, system in (("sapi", "Windows"), ("say", "Darwin")):
            with self.subTest(engine=engine):
                self.print.reset_mock()
                self.native_call(engine, system, returncode=1)
                self.assert_fallback()

    def test_native_missing_executable_and_timeout_fall_back_once(self):
        for engine, system in (("sapi", "Windows"), ("say", "Darwin")):
            for error in (FileNotFoundError(engine), subprocess.TimeoutExpired(engine, 30)):
                with self.subTest(engine=engine, error=type(error).__name__):
                    self.print.reset_mock()
                    self.platform.return_value = system
                    self.run.side_effect = error
                    tts.speak(self.text, engine=engine)
                    self.assert_fallback()

    def test_piper_success_preserves_commands_and_audio(self):
        for system, command in (
            ("Linux", ["aplay", "-r", "22050", "-f", "S16_LE", "-c", "1"]),
            ("Windows", ["ffplay", "-nodisp", "-autoexit", "-f", "s16le",
                         "-ar", "22050", "-ac", "1", "-i", "-"]),
        ):
            with self.subTest(system=system):
                self.platform.return_value = system
                synthesis = self.process("piper")
                playback = self.process(command[0])
                self.popen.reset_mock()
                self.popen.side_effect = [synthesis, playback]
                tts.speak(self.text, engine="piper")
                self.assertEqual(self.popen.call_args_list, [
                    call(["piper", "--model", tts.PIPER_MODEL, "--output-raw"],
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.DEVNULL),
                    call(command, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL),
                ])
                synthesis.communicate.assert_called_once_with(input=self.text.encode(), timeout=30)
                playback.communicate.assert_called_once_with(input=b"audio", timeout=30)
                synthesis.kill.assert_not_called()
                playback.kill.assert_not_called()
                self.print.assert_not_called()
                self.run.assert_not_called()

    def test_failed_synthesis_does_not_start_playback(self):
        self.popen.side_effect = [self.process("piper", returncode=1)]
        tts.speak(self.text, engine="piper")
        self.assertEqual(self.popen.call_count, 1)
        self.assert_fallback()

    def test_failed_playback_falls_back_once(self):
        for system in ("Linux", "Windows"):
            with self.subTest(system=system):
                self.print.reset_mock()
                self.platform.return_value = system
                self.popen.side_effect = [self.process("piper"), self.process("player", returncode=1)]
                tts.speak(self.text, engine="piper")
                self.assert_fallback()

    def test_missing_piper_or_player_falls_back_once(self):
        for system in ("Linux", "Windows"):
            for stage in ("synthesis", "playback"):
                with self.subTest(system=system, stage=stage):
                    self.print.reset_mock()
                    self.popen.reset_mock()
                    self.platform.return_value = system
                    children = [self.process("piper")] if stage == "playback" else []
                    self.popen.side_effect = children + [FileNotFoundError(stage)]
                    tts.speak(self.text, engine="piper")
                    self.assertEqual(self.popen.call_count, len(children) + 1)
                    self.assert_fallback()

    def test_piper_timeouts_kill_and_reap_affected_child(self):
        for stage in ("synthesis", "playback"):
            with self.subTest(stage=stage):
                self.print.reset_mock()
                self.popen.reset_mock()
                synthesis = self.process("piper")
                playback = self.process("aplay")
                affected = synthesis if stage == "synthesis" else playback
                affected.communicate.side_effect = [
                    subprocess.TimeoutExpired(affected.args, 30), (b"", None)]
                self.popen.side_effect = [synthesis, playback]
                tts.speak(self.text, engine="piper")
                data = self.text.encode() if stage == "synthesis" else b"audio"
                self.assertEqual(affected.mock_calls, [
                    call.communicate(input=data, timeout=30),
                    call.kill(),
                    call.communicate(),
                ])
                self.assertEqual(self.popen.call_count, 1 if stage == "synthesis" else 2)
                unaffected = playback if stage == "synthesis" else synthesis
                unaffected.kill.assert_not_called()
                self.assert_fallback()

    def test_platform_mismatch_uses_console_without_subprocess(self):
        for engine in ("sapi", "say", "console"):
            with self.subTest(engine=engine):
                self.print.reset_mock()
                tts.speak(self.text, engine=engine)
                self.assert_fallback()
                self.run.assert_not_called()
                self.popen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
