"""Offline regression tests for Piper synthesis and playback failures."""

import subprocess
import unittest
from unittest.mock import Mock, call, patch

from voice import tts


class PiperTTSFallbackTests(unittest.TestCase):
    text = "Technician's confirmation"
    audio = b"mock audio"

    def check_piper(self, system, failure=None):
        synth = Mock(args=["piper"], returncode=0)
        player = Mock(args=["aplay" if system == "Linux" else "ffplay"], returncode=0)
        synth.communicate.return_value = (self.audio, None)
        player.communicate.return_value = (None, None)
        children = [synth, player]
        affected = None
        if failure:
            stage, kind = failure
            affected = children[stage]
            if kind == "exit":
                affected.returncode = 1
            elif kind == "missing":
                children[stage] = FileNotFoundError(affected.args[0])
            elif kind == "timeout":
                affected.communicate.side_effect = [
                    subprocess.TimeoutExpired(affected.args, 30),
                    (None, None),
                ]

        events = Mock()
        events.attach_mock(synth, "synth")
        events.attach_mock(player, "player")
        with (
            patch.object(tts.platform, "system", return_value=system),
            patch.object(tts.subprocess, "Popen", side_effect=children) as popen,
            patch.object(tts.subprocess, "run") as native,
            patch.object(tts, "_speak_console") as fallback,
            patch.object(tts.logger, "error") as error,
        ):
            events.attach_mock(popen, "popen")
            events.attach_mock(fallback, "fallback")
            tts.speak(self.text, engine="piper")

            native.assert_not_called()
            if failure:
                fallback.assert_called_once_with(self.text)
                error.assert_called_once()
            else:
                fallback.assert_not_called()
                error.assert_not_called()

            popen.assert_any_call(
                ["piper", "--model", tts.PIPER_MODEL, "--output-raw"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
            expected_launches = 1 if failure and failure[0] == 0 else 2
            self.assertEqual(popen.call_count, expected_launches)
            for launch in popen.call_args_list:
                self.assertIsInstance(launch.args[0], list)
                self.assertFalse(launch.kwargs.get("shell", False))
            if failure != (0, "missing"):
                self.assertEqual(synth.communicate.call_args_list[0],
                                 call(input=self.text.encode(), timeout=30))
            if expected_launches == 2:
                command = (["aplay", "-r", "22050", "-f", "S16_LE", "-c", "1"]
                           if system == "Linux" else
                           ["ffplay", "-nodisp", "-autoexit", "-f", "s16le",
                            "-ar", "22050", "-ac", "1", "-i", "-"])
                self.assertEqual(popen.call_args, call(
                    command, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL))
                self.assertLess(
                    events.mock_calls.index(call.synth.communicate(
                        input=self.text.encode(), timeout=30)),
                    events.mock_calls.index(call.popen(
                        command, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)),
                )
                if failure != (1, "missing"):
                    self.assertEqual(player.communicate.call_args_list[0],
                                     call(input=self.audio, timeout=30))
            else:
                player.communicate.assert_not_called()

            for child in (synth, player):
                if failure and failure[1] == "timeout" and child is affected:
                    child.kill.assert_called_once_with()
                    self.assertEqual(child.method_calls[-2:],
                                     [call.kill(), call.communicate()])
                    name = "synth" if child is synth else "player"
                    self.assertLess(
                        events.mock_calls.index(getattr(call, name).communicate()),
                        events.mock_calls.index(call.fallback(self.text)),
                    )
                else:
                    child.kill.assert_not_called()

    def check_platforms(self, failure=None):
        for system in ("Linux", "Windows", "Darwin"):
            with self.subTest(system=system, failure=failure):
                self.check_piper(system, failure)

    def test_successful_synthesis_and_playback(self):
        self.check_platforms()

    def test_failed_synthesis_does_not_launch_player(self):
        self.check_platforms((0, "exit"))

    def test_failed_playback_falls_back_once(self):
        self.check_platforms((1, "exit"))

    def test_missing_executables_fall_back_once(self):
        for stage in (0, 1):
            self.check_platforms((stage, "missing"))

    def test_synthesis_timeout_reaps_child_before_fallback(self):
        self.check_platforms((0, "timeout"))

    def test_player_timeout_reaps_child_before_fallback(self):
        self.check_platforms((1, "timeout"))


if __name__ == "__main__":
    unittest.main()
