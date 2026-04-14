"""Text-to-speech engine — offline-capable on Windows, macOS, and Linux.

Supported engines:
  - sapi    : Windows Speech API (built-in, no install needed)
  - say     : macOS built-in TTS
  - piper   : Piper neural TTS (Linux or cross-platform, fully offline)
  - console : Fallback — prints to terminal only
"""

import subprocess
import logging
import platform
import threading

from voice.config import TTS_ENGINE, PIPER_MODEL

logger = logging.getLogger("voice.tts")

# Lock to prevent overlapping speech
_speak_lock = threading.Lock()


def speak(text: str, engine: str | None = None) -> None:
    """Speak text aloud using the configured TTS engine.

    Thread-safe: concurrent calls will queue behind the lock so speech
    doesn't overlap.
    """
    engine = engine or TTS_ENGINE
    logger.info(f"TTS [{engine}]: {text}")

    with _speak_lock:
        try:
            if engine == "sapi" and platform.system() == "Windows":
                _speak_sapi(text)
            elif engine == "say" and platform.system() == "Darwin":
                _speak_macos(text)
            elif engine == "piper":
                _speak_piper(text)
            else:
                _speak_console(text)
        except Exception as e:
            logger.error(f"TTS engine '{engine}' failed: {e}")
            _speak_console(text)


def _speak_sapi(text: str) -> None:
    """Windows Speech API via PowerShell (built-in, no install required)."""
    # Escape single quotes for PowerShell
    escaped = text.replace("'", "''")
    ps_command = (
        f"Add-Type -AssemblyName System.Speech; "
        f"$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        f"$synth.Rate = 1; "
        f"$synth.Speak('{escaped}')"
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_command],
        check=False,
        capture_output=True,
        timeout=30,
    )


def _speak_macos(text: str) -> None:
    """macOS built-in TTS using the 'say' command."""
    subprocess.run(["say", "-v", "Samantha", text], check=False, timeout=30)


def _speak_piper(text: str) -> None:
    """Piper neural TTS — fully offline, works on Linux and Windows."""
    try:
        proc = subprocess.Popen(
            ["piper", "--model", PIPER_MODEL, "--output-raw"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        stdout, _ = proc.communicate(input=text.encode(), timeout=30)

        # Play raw audio — use aplay on Linux, ffplay as cross-platform fallback
        if platform.system() == "Linux":
            play_cmd = ["aplay", "-r", "22050", "-f", "S16_LE", "-c", "1"]
        else:
            play_cmd = [
                "ffplay", "-nodisp", "-autoexit",
                "-f", "s16le", "-ar", "22050", "-ac", "1", "-i", "-",
            ]

        play_proc = subprocess.Popen(
            play_cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL,
        )
        play_proc.communicate(input=stdout, timeout=30)

    except FileNotFoundError:
        logger.error("piper not found. Install: pip install piper-tts")
        _speak_console(text)


def _speak_console(text: str) -> None:
    """Fallback — print to console."""
    print(f"  [LIMS BOX]: {text}")
