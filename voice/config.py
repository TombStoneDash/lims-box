"""LIMS BOX Voice Interface — Configuration.

All settings can be overridden via environment variables prefixed with LIMS_VOICE_.
Example: LIMS_VOICE_WHISPER_MODEL=small.en
"""

import os
import platform


def _env(key: str, default: str) -> str:
    return os.environ.get(f"LIMS_VOICE_{key}", default)


# Wake words (case-insensitive, matched after STT)
WAKE_WORDS = ["hey lims", "lims box"]

# Whisper model for local speech-to-text (offline)
WHISPER_MODEL = _env("WHISPER_MODEL", "base.en")  # tiny.en, base.en, small.en, medium.en
WHISPER_DEVICE = _env("WHISPER_DEVICE", "cpu")  # "cpu" or "cuda"
WHISPER_COMPUTE_TYPE = _env("WHISPER_COMPUTE_TYPE", "int8")  # int8, float16, float32

# TTS engine — auto-detected per platform, or set via env
# Options: "sapi" (Windows), "say" (macOS), "piper" (Linux/any), "console" (fallback)
_platform = platform.system()
_default_tts = {"Windows": "sapi", "Darwin": "say", "Linux": "piper"}.get(_platform, "console")
TTS_ENGINE = _env("TTS_ENGINE", _default_tts)
PIPER_MODEL = _env("PIPER_MODEL", "en_US-lessac-medium")

# SENAITE connection
SENAITE_BASE_URL = _env("SENAITE_BASE_URL", "http://localhost:8080/senaite")
SENAITE_USERNAME = _env("SENAITE_USERNAME", "admin")
SENAITE_PASSWORD = _env("SENAITE_PASSWORD", "admin")

# Audio settings
SAMPLE_RATE = int(_env("SAMPLE_RATE", "16000"))
SILENCE_THRESHOLD = float(_env("SILENCE_THRESHOLD", "0.01"))
SILENCE_DURATION = float(_env("SILENCE_DURATION", "1.5"))  # seconds of silence before processing
LISTEN_TIMEOUT = float(_env("LISTEN_TIMEOUT", "10"))  # max seconds for a command

# Command queue (for offline resilience)
QUEUE_DB = _env("QUEUE_DB", "voice_command_queue.db")
RETRY_INTERVAL = int(_env("RETRY_INTERVAL", "30"))  # seconds between queue drain attempts
MAX_RETRY_ATTEMPTS = int(_env("MAX_RETRY_ATTEMPTS", "50"))  # give up after this many failures
