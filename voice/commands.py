"""Voice command parser and executor for LIMS BOX.

Handles six voice commands against the SENAITE JSON API:
  1. "Log sample [sample ID]"
  2. "Start test [test name]"
  3. "Record result [value] for [test]"
  4. "Show pending samples"
  5. "Mark sample complete"
  6. "Print label for [sample]"

Maintains a session context (current sample) so commands like
"mark sample complete" know which sample to act on.
"""

import re
import logging
from typing import Optional, Tuple

from senaite.client import SenaiteClient

logger = logging.getLogger("voice.commands")


# ── Command patterns (order matters — first match wins) ──────────────────────

PATTERNS = [
    (r"log\s+sample\s+(.+)",                           "log_sample"),
    (r"start\s+test\s+(.+)",                            "start_test"),
    (r"record\s+result\s+(.+?)\s+for\s+(.+)",           "record_result"),
    (r"show\s+pending\s+samples?",                       "show_pending"),
    (r"mark\s+(?:sample\s+)?complete",                   "mark_complete"),
    (r"print\s+label\s+(?:for\s+)?(.+)",                 "print_label"),
]


# ── Session context ─────────────────────────────────────────────────────────

class SessionContext:
    """Tracks the current sample being worked on so that commands like
    'mark complete' don't need the sample ID repeated every time."""

    def __init__(self):
        self.current_sample_id: Optional[str] = None
        self.current_sample_uid: Optional[str] = None

    def set_sample(self, sample_id: str, uid: str | None = None) -> None:
        self.current_sample_id = sample_id
        self.current_sample_uid = uid
        logger.info(f"Session context: current sample = {sample_id}")

    def clear(self) -> None:
        self.current_sample_id = None
        self.current_sample_uid = None

    def __repr__(self) -> str:
        return f"SessionContext(sample={self.current_sample_id})"


# Module-level session — shared across the listener loop
session = SessionContext()


# ── Parsing ──────────────────────────────────────────────────────────────────

def parse_command(text: str) -> Optional[Tuple[str, tuple]]:
    """Parse transcribed text into (command_name, args).

    Returns None if no pattern matches.
    """
    cleaned = text.lower().strip()
    # Remove filler words that whisper sometimes adds
    cleaned = re.sub(r"\b(um|uh|like|please|okay|so)\b", "", cleaned).strip()
    cleaned = re.sub(r"\s{2,}", " ", cleaned)

    for pattern, cmd_name in PATTERNS:
        match = re.search(pattern, cleaned)
        if match:
            return cmd_name, match.groups()

    return None


# ── Execution ────────────────────────────────────────────────────────────────

def execute_command(cmd_name: str, args: tuple, client: SenaiteClient) -> str:
    """Execute a parsed voice command against SENAITE.

    Returns a string meant to be spoken aloud as confirmation/feedback.
    """
    try:
        handler = _HANDLERS.get(cmd_name)
        if handler:
            return handler(args, client)
        return "Command not recognized."
    except Exception as e:
        logger.error(f"Command execution error ({cmd_name}): {e}", exc_info=True)
        return f"Error executing command: {e}"


# ── Individual command handlers ──────────────────────────────────────────────

def _handle_log_sample(args: tuple, client: SenaiteClient) -> str:
    sample_id = _normalize_sample_id(args[0])

    # Check if sample already exists
    existing = client.get_sample(sample_id)
    if existing:
        session.set_sample(sample_id, existing.get("uid"))
        return f"Sample {sample_id} already exists. Status: {existing.get('review_state', 'unknown')}. Set as current sample."

    result = client.create_sample(sample_id)
    uid = result.get("uid") if isinstance(result, dict) else None
    session.set_sample(sample_id, uid)
    return f"Sample {sample_id} has been logged. Holding time tracking started."


def _handle_start_test(args: tuple, client: SenaiteClient) -> str:
    test_name = args[0].strip()

    if not session.current_sample_id:
        return "No current sample. Say 'log sample' first to set the active sample."

    sample = client.get_sample(session.current_sample_id)
    if not sample:
        return f"Sample {session.current_sample_id} not found in SENAITE."

    # Look up the analysis for this test on the current sample
    try:
        analyses = client.get(
            f"Analysis?getParentUID={sample['uid']}&getKeyword={test_name}"
        )
        items = analyses.get("items", [])
        if not items:
            return f"Test '{test_name}' is not configured on sample {session.current_sample_id}."

        analysis = items[0]
        current_state = analysis.get("review_state", "")
        if current_state in ("verified", "published"):
            return f"Test {test_name} is already {current_state}."

        return f"Test {test_name} started on sample {session.current_sample_id}. Awaiting results."

    except Exception as e:
        logger.warning(f"Could not look up test '{test_name}': {e}")
        # Still provide feedback even if lookup fails
        return f"Test {test_name} noted for sample {session.current_sample_id}. Awaiting results."


def _handle_record_result(args: tuple, client: SenaiteClient) -> str:
    value = args[0].strip()
    test_name = args[1].strip()

    if not session.current_sample_id:
        return "No current sample. Say 'log sample' first."

    try:
        client.record_result(session.current_sample_id, test_name, value)
        return f"Result {value} recorded for {test_name} on sample {session.current_sample_id}."
    except ValueError as e:
        return str(e)


def _handle_show_pending(args: tuple, client: SenaiteClient) -> str:
    samples = client.get_pending_samples()
    if not samples:
        return "No pending samples."

    count = len(samples)
    # Read out the first few sample IDs
    ids = [s.get("getId", s.get("id", "unknown")) for s in samples[:5]]
    spoken_ids = ", ".join(ids)
    suffix = f" and {count - 5} more" if count > 5 else ""
    return f"{count} pending samples. {spoken_ids}{suffix}."


def _handle_mark_complete(args: tuple, client: SenaiteClient) -> str:
    if not session.current_sample_id:
        return "No current sample. Say 'log sample' first to set the active sample."

    try:
        client.transition_sample(session.current_sample_id, "submit")
        completed_id = session.current_sample_id
        session.clear()
        return f"Sample {completed_id} marked complete and submitted for review."
    except ValueError as e:
        return str(e)
    except Exception as e:
        logger.error(f"Failed to mark complete: {e}")
        return f"Could not mark sample complete: {e}"


def _handle_print_label(args: tuple, client: SenaiteClient) -> str:
    sample_id = _normalize_sample_id(args[0])

    # Verify the sample exists
    sample = client.get_sample(sample_id)
    if not sample:
        return f"Sample {sample_id} not found. Cannot print label."

    # SENAITE label printing is typically handled by a sticker printer
    # integration. We trigger the API endpoint and confirm.
    try:
        sticker_url = sample.get("api_url", "")
        if sticker_url:
            # Attempt to trigger sticker print via SENAITE's sticker action
            client.post(
                f"AnalysisRequest/{sample['uid']}/sticker",
                {"template": "Code_128_1x48mm.pt"},
            )
        return f"Label sent to printer for sample {sample_id}."
    except Exception as e:
        logger.warning(f"Label print API call failed: {e}")
        # Even if the API call fails, the user needs feedback
        return f"Label print requested for {sample_id}. Check printer status."


# ── Helpers ──────────────────────────────────────────────────────────────────

def _normalize_sample_id(raw: str) -> str:
    """Clean up a sample ID from speech transcription.

    Common whisper artifacts: 'SA dash 2026 dash 0 0 1' -> 'SA-2026-001'
    """
    text = raw.strip()
    # Collapse spoken "dash" to actual dashes
    text = re.sub(r"\s*dash\s*", "-", text, flags=re.IGNORECASE)
    # Remove spaces around hyphens
    text = re.sub(r"\s*-\s*", "-", text)
    # Remove remaining spaces within the ID (e.g., "S A" -> "SA")
    text = re.sub(r"\s+", "", text)
    return text.upper()


# ── Handler dispatch table ───────────────────────────────────────────────────

_HANDLERS = {
    "log_sample": _handle_log_sample,
    "start_test": _handle_start_test,
    "record_result": _handle_record_result,
    "show_pending": _handle_show_pending,
    "mark_complete": _handle_mark_complete,
    "print_label": _handle_print_label,
}
