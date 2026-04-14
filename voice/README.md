# LIMS BOX Voice Interface

Hands-free SENAITE operation for lab technicians wearing PPE/gloves.

Runs **entirely offline** using local speech-to-text (faster-whisper) and
platform-native TTS. Designed for rural clinics with unreliable internet.

## Quick Start

```bash
# From the lims-box directory:
cd C:\TombstoneDash\factory\lims-box

# Install dependencies
pip install -r voice/requirements.txt

# Run the voice interface
python -m voice
```

## Requirements

| Dependency | Purpose | Install |
|---|---|---|
| **faster-whisper** | Offline speech-to-text (uses CTranslate2) | `pip install faster-whisper` |
| **sounddevice** | Microphone access | `pip install sounddevice` |
| **numpy** | Audio processing | `pip install numpy` |
| **piper-tts** | Neural TTS on Linux (optional) | `pip install piper-tts` |

On **Windows**, TTS uses the built-in Speech API (SAPI) via PowerShell — no
extra install needed.

On **macOS**, TTS uses the built-in `say` command.

### First Run

The first time you run the voice interface, faster-whisper will download the
Whisper model (~150 MB for `base.en`). After that, it runs fully offline.

## Voice Commands

Say **"Hey LIMS"** or **"LIMS Box"** to activate, then speak a command:

| Command | Example | What it does |
|---|---|---|
| Log sample | "Log sample SA-2026-0042" | Creates a new sample in SENAITE |
| Start test | "Start test turbidity" | Begins a test on the current sample |
| Record result | "Record result 4.2 for pH" | Records a test result |
| Show pending | "Show pending samples" | Lists samples awaiting analysis |
| Mark complete | "Mark sample complete" | Submits current sample for review |
| Print label | "Print label for SA-2026-0042" | Sends label to sticker printer |

You can also say the wake word and command together:
**"Hey LIMS show pending samples"**

## Configuration

All settings can be overridden via environment variables:

```bash
# Use a larger Whisper model for better accuracy
set LIMS_VOICE_WHISPER_MODEL=small.en

# Use GPU acceleration
set LIMS_VOICE_WHISPER_DEVICE=cuda

# Point to your SENAITE instance
set LIMS_VOICE_SENAITE_BASE_URL=http://192.168.1.100:8080/senaite
set LIMS_VOICE_SENAITE_USERNAME=labtech
set LIMS_VOICE_SENAITE_PASSWORD=secret
```

See `config.py` for the full list of settings.

## Offline Resilience

When SENAITE is unreachable, commands are stored in a local SQLite queue
(`voice_command_queue.db`). A background thread automatically replays
queued commands when connectivity is restored.

The queue survives restarts — if you shut down the voice interface and
restart it later, pending commands will still be there.

## Architecture

```
voice/
  __init__.py       Package init
  __main__.py       Entry point for python -m voice
  config.py         All configuration (env-var overridable)
  listener.py       Wake word detection + command capture loop
  commands.py       Command parser, session context, SENAITE execution
  queue.py          SQLite-backed offline command queue with drain loop
  tts.py            Text-to-speech (Windows SAPI / macOS say / piper)
  requirements.txt  Python dependencies

senaite/
  __init__.py       Package init
  client.py         SENAITE JSON API client (stdlib only, no requests)
```
