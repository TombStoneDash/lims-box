"""LIMS BOX Voice Listener — Wake word detection + command capture.

Runs entirely offline using faster-whisper for speech-to-text.
Designed for lab technicians wearing PPE/gloves who cannot touch screens.

Usage:
    python -m voice              # from the lims-box directory
    python -m voice.listener     # explicit module
"""

import sys
import time
import logging
import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
logger = logging.getLogger("voice.listener")


def _check_dependencies():
    """Verify required packages are installed and give clear error messages."""
    missing = []

    try:
        import sounddevice  # noqa: F401
    except ImportError:
        missing.append("sounddevice")

    try:
        from faster_whisper import WhisperModel  # noqa: F401
    except ImportError:
        missing.append("faster-whisper")

    if missing:
        logger.error(
            f"Missing required packages: {', '.join(missing)}\n"
            f"Install with: pip install {' '.join(missing)}"
        )
        sys.exit(1)


_check_dependencies()

import sounddevice as sd
from faster_whisper import WhisperModel

from voice.config import (
    WAKE_WORDS,
    WHISPER_MODEL,
    WHISPER_DEVICE,
    WHISPER_COMPUTE_TYPE,
    SAMPLE_RATE,
    SILENCE_THRESHOLD,
    SILENCE_DURATION,
    LISTEN_TIMEOUT,
    SENAITE_BASE_URL,
    SENAITE_USERNAME,
    SENAITE_PASSWORD,
    QUEUE_DB,
)
from voice.commands import parse_command, execute_command
from voice.tts import speak
from voice.queue import CommandQueue
from senaite.client import SenaiteClient


# ── Audio recording ─────────────────────────────────────────────────────────

def record_until_silence(
    sr: int = SAMPLE_RATE,
    max_seconds: float = LISTEN_TIMEOUT,
    silence_threshold: float = SILENCE_THRESHOLD,
) -> np.ndarray:
    """Record audio from the microphone until silence is detected or timeout.

    Returns a 1-D float32 numpy array of audio samples.
    """
    chunks: list[np.ndarray] = []
    silent_frames = 0
    frames_per_chunk = int(sr * 0.1)  # 100 ms chunks
    silence_count = int(SILENCE_DURATION / 0.1)

    def callback(indata, frames, time_info, status):
        nonlocal silent_frames
        if status:
            logger.debug(f"Audio status: {status}")
        rms = float(np.sqrt(np.mean(indata ** 2)))
        if rms < silence_threshold:
            silent_frames += 1
        else:
            silent_frames = 0
        chunks.append(indata.copy())

    try:
        with sd.InputStream(
            samplerate=sr,
            channels=1,
            dtype="float32",
            blocksize=frames_per_chunk,
            callback=callback,
        ):
            start = time.time()
            while time.time() - start < max_seconds:
                time.sleep(0.05)
                # Only break on silence if we have recorded some actual speech
                if silent_frames >= silence_count and len(chunks) > silence_count:
                    break
    except sd.PortAudioError as e:
        logger.error(f"Microphone error: {e}")
        return np.array([], dtype="float32")

    if not chunks:
        return np.array([], dtype="float32")

    return np.concatenate(chunks).flatten()


def transcribe(model: WhisperModel, audio: np.ndarray) -> str:
    """Run faster-whisper on an audio array, return transcribed text."""
    if len(audio) == 0:
        return ""
    segments, _info = model.transcribe(audio, language="en", beam_size=3)
    return " ".join(seg.text for seg in segments).strip()


# ── Wake word detection ─────────────────────────────────────────────────────

def contains_wake_word(text: str) -> str | None:
    """Check if transcribed text contains a wake word.

    Returns the matched wake word, or None.
    """
    lower = text.lower()
    for w in WAKE_WORDS:
        if w in lower:
            return w
    return None


def extract_inline_command(text: str, wake_word: str) -> str | None:
    """If the user said the wake word and a command in one breath,
    extract the command portion.

    Example: "Hey LIMS show pending samples" -> "show pending samples"
    """
    lower = text.lower()
    idx = lower.find(wake_word)
    if idx < 0:
        return None
    remainder = text[idx + len(wake_word):].strip()
    # Only return if there's substantial text after the wake word
    if len(remainder) > 3:
        return remainder
    return None


# ── Main loop ───────────────────────────────────────────────────────────────

def main():
    logger.info("=" * 60)
    logger.info("LIMS BOX Voice Interface")
    logger.info("=" * 60)
    logger.info(f"Wake words     : {WAKE_WORDS}")
    logger.info(f"Whisper model  : {WHISPER_MODEL} (device={WHISPER_DEVICE})")
    logger.info(f"SENAITE        : {SENAITE_BASE_URL}")

    # Load whisper model (downloads on first run, then cached)
    logger.info(f"Loading Whisper model '{WHISPER_MODEL}' ...")
    model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE)
    logger.info("Whisper model loaded.")

    # SENAITE client
    client = SenaiteClient(SENAITE_BASE_URL, SENAITE_USERNAME, SENAITE_PASSWORD)

    # Command queue with background drain
    queue = CommandQueue(QUEUE_DB)

    def _execute_from_queue(cmd_name: str, args: tuple) -> str:
        return execute_command(cmd_name, args, client)

    queue.start_drain_loop(
        execute_fn=_execute_from_queue,
        ping_fn=client.ping,
        speak_fn=speak,
    )

    # Connectivity check
    if client.ping():
        logger.info("SENAITE connected successfully.")
    else:
        logger.warning("SENAITE unreachable — commands will be queued for later.")

    speak("LIMS Box voice interface ready. Say 'Hey LIMS' to begin.")

    try:
        while True:
            # ── Phase 1: Listen for wake word ──
            audio = record_until_silence(max_seconds=5)
            if len(audio) < SAMPLE_RATE * 0.3:  # less than 300 ms of audio
                continue

            transcript = transcribe(model, audio)
            if not transcript:
                continue

            wake = contains_wake_word(transcript)
            if not wake:
                continue

            logger.info(f"Wake word detected in: '{transcript}'")

            # Check for inline command (wake word + command in one breath)
            inline_cmd = extract_inline_command(transcript, wake)
            if inline_cmd:
                cmd_text = inline_cmd
                logger.info(f"Inline command: '{cmd_text}'")
            else:
                # ── Phase 2: Listen for command ──
                speak("Listening.")
                command_audio = record_until_silence()
                if len(command_audio) < SAMPLE_RATE * 0.3:
                    speak("I didn't catch that. Try again.")
                    continue

                cmd_text = transcribe(model, command_audio)
                logger.info(f"Command heard: '{cmd_text}'")

                if not cmd_text:
                    speak("I didn't catch that. Try again.")
                    continue

            # ── Phase 3: Parse and execute ──
            parsed = parse_command(cmd_text)
            if not parsed:
                speak(f"I heard '{cmd_text}' but couldn't match a command. Try again.")
                continue

            cmd_name, args = parsed
            logger.info(f"Parsed: {cmd_name}{args}")

            if client.ping():
                response = execute_command(cmd_name, args, client)
                speak(response)
            else:
                queue.enqueue(cmd_name, args)
                pending = queue.count()
                speak(
                    f"SENAITE is offline. Command queued. "
                    f"{pending} command{'s' if pending != 1 else ''} pending."
                )

    except KeyboardInterrupt:
        logger.info("Shutting down voice interface (Ctrl+C)")
        speak("Voice interface shutting down.")
    finally:
        queue.close()
        logger.info("Cleanup complete.")


if __name__ == "__main__":
    main()
