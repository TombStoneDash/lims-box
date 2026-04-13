"""LIMS BOX Voice Listener — Wake word detection + command capture.

Runs entirely offline using faster-whisper for speech-to-text.
Usage: python -m voice.listener
"""

import sys
import time
import logging
import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("voice.listener")

try:
    import sounddevice as sd
except ImportError:
    logger.error("sounddevice required: pip install sounddevice")
    sys.exit(1)

try:
    from faster_whisper import WhisperModel
except ImportError:
    logger.error("faster-whisper required: pip install faster-whisper")
    sys.exit(1)

from voice.config import (
    WAKE_WORDS, WHISPER_MODEL, WHISPER_DEVICE,
    SAMPLE_RATE, SILENCE_THRESHOLD, SILENCE_DURATION, LISTEN_TIMEOUT,
    SENAITE_BASE_URL, SENAITE_USERNAME, SENAITE_PASSWORD, QUEUE_DB,
)
from voice.commands import parse_command, execute_command
from voice.tts import speak
from voice.queue import CommandQueue
from senaite.client import SenaiteClient


def record_until_silence(sr: int = SAMPLE_RATE, max_seconds: float = LISTEN_TIMEOUT) -> np.ndarray:
    """Record audio until silence is detected or timeout."""
    chunks = []
    silent_frames = 0
    frames_per_chunk = int(sr * 0.1)  # 100ms chunks
    silence_count = int(SILENCE_DURATION / 0.1)

    logger.debug("Recording...")

    def callback(indata, frames, time_info, status):
        nonlocal silent_frames
        rms = np.sqrt(np.mean(indata ** 2))
        if rms < SILENCE_THRESHOLD:
            silent_frames += 1
        else:
            silent_frames = 0
        chunks.append(indata.copy())

    with sd.InputStream(samplerate=sr, channels=1, dtype="float32",
                        blocksize=frames_per_chunk, callback=callback):
        start = time.time()
        while time.time() - start < max_seconds:
            time.sleep(0.05)
            if silent_frames >= silence_count and len(chunks) > silence_count:
                break

    if not chunks:
        return np.array([], dtype="float32")

    audio = np.concatenate(chunks).flatten()
    return audio


def contains_wake_word(text: str) -> bool:
    """Check if transcribed text contains a wake word."""
    lower = text.lower()
    return any(w in lower for w in WAKE_WORDS)


def main():
    logger.info("LIMS BOX Voice Interface starting...")
    logger.info(f"Wake words: {WAKE_WORDS}")
    logger.info(f"Loading Whisper model: {WHISPER_MODEL}")

    model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type="int8")
    client = SenaiteClient(SENAITE_BASE_URL, SENAITE_USERNAME, SENAITE_PASSWORD)
    queue = CommandQueue(QUEUE_DB)

    # Check SENAITE connectivity
    if client.ping():
        logger.info(f"SENAITE connected: {SENAITE_BASE_URL}")
    else:
        logger.warning("SENAITE unreachable — commands will be queued")

    speak("LIMS Box voice interface ready.")

    try:
        while True:
            # Phase 1: Listen for wake word
            audio = record_until_silence(max_seconds=5)
            if len(audio) < SAMPLE_RATE * 0.3:
                continue

            segments, _ = model.transcribe(audio, language="en")
            transcript = " ".join(s.text for s in segments).strip()

            if not transcript or not contains_wake_word(transcript):
                continue

            logger.info(f"Wake word detected: '{transcript}'")
            speak("Listening.")

            # Phase 2: Listen for command
            command_audio = record_until_silence()
            if len(command_audio) < SAMPLE_RATE * 0.3:
                speak("I didn't catch that.")
                continue

            cmd_segments, _ = model.transcribe(command_audio, language="en")
            cmd_text = " ".join(s.text for s in cmd_segments).strip()
            logger.info(f"Command: '{cmd_text}'")

            if not cmd_text:
                speak("I didn't catch that. Try again.")
                continue

            # Phase 3: Parse and execute
            parsed = parse_command(cmd_text)
            if not parsed:
                speak(f"I heard '{cmd_text}' but couldn't understand the command.")
                continue

            cmd_name, args = parsed

            if client.ping():
                response = execute_command(cmd_name, args, client)
                speak(response)
            else:
                queue.enqueue(cmd_name, args)
                speak(f"SENAITE is offline. Command queued. {queue.count()} commands pending.")

    except KeyboardInterrupt:
        logger.info("Shutting down voice interface.")
        speak("Voice interface shutting down.")
    finally:
        queue.close()


if __name__ == "__main__":
    main()
