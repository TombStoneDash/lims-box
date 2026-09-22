"""Offline regression tests for Piper failure feedback and child cleanup."""

import subprocess
import unittest
from unittest.mock import Mock, call, patch

from voice import tts


class PiperFailureFeedbackTests(unittest.TestCase):
    text = "Technician's confirmation — sample received"
    audio = b"raw audio"

    def check_piper(self, *, system="Linux", failed_child=None, failure=None):
        synth = Mock(args=["piper"], returncode=0)
        player = Mock(args=["aplay" if system == "Linux" else "ffplay"], returncode=0)
        synth.communicate.return_value = (self.audio, None)
        player.communicate.return_value = (None, None)
        children = [synth, player]
        affected = children[failed_child] if failed_child is not None else None
        if failure == "exit":
            affected.returncode = 1
        elif failure == "timeout":
            affected.communicate.side_effect = [
                subprocess.TimeoutExpired(affected.args, 30),
                (None, None),
            ]
        elif failure == "missing":
            children[failed_child] = FileNotFoundError(affected.args[0])

        with (
            patch.object(tts.platform, "system", return_value=system),
            patch.object(tts.subprocess, "Popen", side_effect=children) as popen,
            patch.object(tts.subprocess, "run") as native,
            patch.object(tts, "_speak_console", wraps=tts._speak_console) as fallback,
            patch.object(tts.logger, "error"),
            patch("builtins.print") as console_print,
        ):
            tts.speak(self.text, engine="piper")

            if failure:
                fallback.assert_called_once_with(self.text)
                console_print.assert_called_once_with(f"  [LIMS BOX]: {self.text}")
            else:
                fallback.assert_not_called()
                console_print.assert_not_called()
            native.assert_not_called()
            playback_started = failed_child != 0
            self.assertEqual(popen.call_count, 2 if playback_started else 1)
            self.assertEqual(popen.call_args_list[0], call(
                ["piper", "--model", tts.PIPER_MODEL, "--output-raw"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            ))
            if playback_started:
                command = (
                    ["aplay", "-r", "22050", "-f", "S16_LE", "-c", "1"]
                    if system == "Linux" else
                    ["ffplay", "-nodisp", "-autoexit", "-f", "s16le",
                     "-ar", "22050", "-ac", "1", "-i", "-"]
                )
                self.assertEqual(popen.call_args_list[1], call(
                    command, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL,
                ))

            for index, child in enumerate((synth, player)):
                with self.subTest(child=index):
                    started = (index == 0 or playback_started) and not (
                        failure == "missing" and index == failed_child
                    )
                    if not started:
                        self.assertEqual(child.mock_calls, [])
                    elif failure == "timeout" and child is affected:
                        # The second communicate drains pipes and reaps the killed child.
                        self.assertEqual(child.mock_calls, [
                            call.communicate(
                                input=self.text.encode() if index == 0 else self.audio,
                                timeout=30,
                            ),
                            call.kill(),
                            call.communicate(),
                        ])
                    else:
                        self.assertEqual(child.mock_calls, [call.communicate(
                            input=self.text.encode() if index == 0 else self.audio,
                            timeout=30,
                        )])

    def test_success(self):
        for system in ("Linux", "Windows"):
            with self.subTest(system=system):
                self.check_piper(system=system)

    def test_synthesis_nonzero_exit_prevents_playback(self):
        self.check_piper(failed_child=0, failure="exit")

    def test_playback_nonzero_exit(self):
        self.check_piper(failed_child=1, failure="exit")

    def test_missing_synthesizer_prevents_playback(self):
        self.check_piper(failed_child=0, failure="missing")

    def test_missing_player(self):
        for system in ("Linux", "Windows"):
            with self.subTest(system=system):
                self.check_piper(system=system, failed_child=1, failure="missing")

    def test_synthesis_timeout_reaps_child_and_prevents_playback(self):
        self.check_piper(failed_child=0, failure="timeout")

    def test_playback_timeout_reaps_child(self):
        self.check_piper(failed_child=1, failure="timeout")


if __name__ == "__main__":
    unittest.main()
