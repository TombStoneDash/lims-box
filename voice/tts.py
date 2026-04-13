"""Text-to-speech engine — offline-capable using macOS say or piper-tts."""

import subprocess
import logging
import platform

logger = logging.getLogger("voice.tts")


def speak(text: str, engine: str = "say", piper_model: str = "en_US-lessac-medium") -> None:
    """Speak text aloud using the configured TTS engine."""
    logger.info(f"TTS: {text}")

    if engine == "say" and platform.system() == "Darwin":
        # macOS built-in TTS (no internet required)
        subprocess.run(["say", "-v", "Samantha", text], check=False)

    elif engine == "piper":
        # Piper TTS — fully offline neural TTS
        try:
            proc = subprocess.Popen(
                ["piper", "--model", piper_model, "--output-raw"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
            stdout, _ = proc.communicate(input=text.encode())
            # Play raw audio via aplay (Linux) or ffplay
            play_proc = subprocess.Popen(
                ["aplay", "-r", "22050", "-f", "S16_LE", "-c", "1"],
                stdin=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
            play_proc.communicate(input=stdout)
        except FileNotFoundError:
            logger.error("piper not found. Install: pip install piper-tts")
            # Fallback to print
            print(f"[LIMS BOX]: {text}")

    else:
        # Fallback — just print
        print(f"[LIMS BOX]: {text}")
