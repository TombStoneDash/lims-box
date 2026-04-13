"""LIMS BOX Voice Interface — Configuration"""

# Wake words (case-insensitive, matched after STT)
WAKE_WORDS = ["hey lims", "lims box"]

# Whisper model for local speech-to-text (offline)
WHISPER_MODEL = "base.en"  # Options: tiny.en, base.en, small.en, medium.en
WHISPER_DEVICE = "cpu"  # or "cuda" if GPU available

# TTS engine
TTS_ENGINE = "say"  # "say" for macOS, "piper" for Linux
PIPER_MODEL = "en_US-lessac-medium"  # only used if TTS_ENGINE == "piper"

# SENAITE connection
SENAITE_BASE_URL = "http://localhost:8080/senaite"
SENAITE_USERNAME = "admin"
SENAITE_PASSWORD = "admin"

# Audio settings
SAMPLE_RATE = 16000
SILENCE_THRESHOLD = 0.01
SILENCE_DURATION = 1.5  # seconds of silence before processing
LISTEN_TIMEOUT = 10  # max seconds to listen for a command

# Command queue (for offline resilience)
QUEUE_DB = "voice_command_queue.db"
RETRY_INTERVAL = 30  # seconds between queue retry attempts
