"""Offline Piper regressions: every subprocess is mocked; no audio is launched."""

import subprocess
import unittest
from unittest.mock import Mock, call, patch

from voice import tts


class PiperFallbackTests(unittest.TestCase):
    text = "Technician's confirmation — complete"
    audio = b"raw audio"

    def setUp(self):
        self.piper = Mock(spec=subprocess.Popen, args=["piper"], returncode=0)
        self.piper.communicate.return_value = (self.audio, None)
        self.player = Mock(spec=subprocess.Popen, args=["aplay"], returncode=0)
        self.player.communicate.return_value = (None, None)
        self.popen = self.enterContext(patch.object(
            tts.subprocess, "Popen", side_effect=[self.piper, self.player],
        ))
        self.native = self.enterContext(patch.object(tts.subprocess, "run"))
        self.system = self.enterContext(patch.object(
            tts.platform, "system", return_value="Linux",
        ))
        self.output = self.enterContext(patch("builtins.print"))
        self.enterContext(patch.object(tts.logger, "error"))

    def tearDown(self):
        self.native.assert_not_called()

    def assert_fallback(self):
        self.output.assert_called_once_with(f"  [LIMS BOX]: {self.text}")

    def test_failed_synthesis_skips_playback_and_falls_back_once(self):
        self.piper.returncode = 1
        tts.speak(self.text, engine="piper")
        self.assert_fallback()
        self.popen.assert_called_once()
        self.player.communicate.assert_not_called()
        self.piper.kill.assert_not_called()

    def test_failed_playback_falls_back_once(self):
        self.player.returncode = 1
        tts.speak(self.text, engine="piper")
        self.assert_fallback()
        self.assertEqual(self.popen.call_count, 2)
        self.player.communicate.assert_called_once_with(input=self.audio, timeout=30)
        self.player.kill.assert_not_called()

    def check_timeout(self, process, other, expected_launches):
        timeout = subprocess.TimeoutExpired(process.args, 30)
        process.communicate.side_effect = [timeout, (None, None)]
        events = Mock()
        events.attach_mock(process, "child")
        events.attach_mock(self.output, "output")
        tts.speak(self.text, engine="piper")
        self.assert_fallback()
        self.assertEqual(self.popen.call_count, expected_launches)
        data = self.text.encode() if process is self.piper else self.audio
        self.assertEqual(events.mock_calls, [
            call.child.communicate(input=data, timeout=30),
            call.child.kill(),
            call.child.communicate(),
            call.output(f"  [LIMS BOX]: {self.text}"),
        ])
        other.kill.assert_not_called()

    def test_synthesis_timeout_reaps_before_fallback_without_playback(self):
        self.check_timeout(self.piper, self.player, 1)
        self.player.communicate.assert_not_called()

    def test_playback_timeout_reaps_before_fallback(self):
        self.check_timeout(self.player, self.piper, 2)
        self.piper.communicate.assert_called_once_with(input=self.text.encode(), timeout=30)

    def test_missing_piper_falls_back_once_without_playback(self):
        self.popen.side_effect = FileNotFoundError("piper")
        tts.speak(self.text, engine="piper")
        self.assert_fallback()
        self.popen.assert_called_once()
        self.player.communicate.assert_not_called()

    def test_missing_player_falls_back_once(self):
        for system in ("Linux", "Windows", "Darwin"):
            with self.subTest(system=system):
                self.system.return_value = system
                self.popen.reset_mock(side_effect=True)
                self.output.reset_mock()
                self.popen.side_effect = [self.piper, FileNotFoundError("player")]
                tts.speak(self.text, engine="piper")
                self.assert_fallback()
                self.assertEqual(self.popen.call_count, 2)
                self.player.communicate.assert_not_called()

    def test_success_preserves_audio_commands_and_has_no_fallback(self):
        for system in ("Linux", "Windows", "Darwin"):
            with self.subTest(system=system):
                self.system.return_value = system
                self.popen.reset_mock(side_effect=True)
                self.popen.side_effect = [self.piper, self.player]
                self.piper.reset_mock()
                self.player.reset_mock()
                with patch.object(tts, "TTS_ENGINE", "piper"):
                    tts.speak(self.text)
                player_cmd = (
                    ["aplay", "-r", "22050", "-f", "S16_LE", "-c", "1"]
                    if system == "Linux" else
                    ["ffplay", "-nodisp", "-autoexit", "-f", "s16le",
                     "-ar", "22050", "-ac", "1", "-i", "-"]
                )
                self.assertEqual(self.popen.call_args_list, [
                    call(["piper", "--model", tts.PIPER_MODEL, "--output-raw"],
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.DEVNULL),
                    call(player_cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL),
                ])
                self.piper.communicate.assert_called_once_with(input=self.text.encode(), timeout=30)
                self.player.communicate.assert_called_once_with(input=self.audio, timeout=30)
                self.piper.kill.assert_not_called()
                self.player.kill.assert_not_called()
                self.output.assert_not_called()


if __name__ == "__main__":
    unittest.main()
