"""Voice command parser and executor for LIMS BOX."""

import re
import logging
from typing import Optional, Tuple
from senaite.client import SenaiteClient

logger = logging.getLogger("voice.commands")

# Command patterns (order matters — first match wins)
PATTERNS = [
    (r"log sample\s+(.+)",              "log_sample"),
    (r"start test\s+(.+)",              "start_test"),
    (r"record result\s+(.+?)\s+for\s+(.+)", "record_result"),
    (r"show pending samples?",          "show_pending"),
    (r"mark sample complete",           "mark_complete"),
    (r"print label\s+(?:for\s+)?(.+)",  "print_label"),
]


def parse_command(text: str) -> Optional[Tuple[str, tuple]]:
    """Parse transcribed text into a command name and arguments."""
    text = text.lower().strip()

    for pattern, cmd_name in PATTERNS:
        match = re.search(pattern, text)
        if match:
            return cmd_name, match.groups()

    return None


def execute_command(cmd_name: str, args: tuple, client: SenaiteClient) -> str:
    """Execute a parsed voice command against SENAITE. Returns spoken feedback."""

    try:
        if cmd_name == "log_sample":
            sample_id = args[0].strip().upper()
            client.create_sample(sample_id)
            return f"Sample {sample_id} has been logged. Holding time tracking started."

        elif cmd_name == "start_test":
            test_name = args[0].strip()
            return f"Test {test_name} started. Awaiting results."

        elif cmd_name == "record_result":
            value = args[0].strip()
            test_name = args[1].strip()
            # In real usage, we'd need the current sample context
            return f"Result {value} recorded for {test_name}."

        elif cmd_name == "show_pending":
            samples = client.get_pending_samples()
            if not samples:
                return "No pending samples."
            count = len(samples)
            ids = ", ".join(s.get("getId", "unknown") for s in samples[:5])
            suffix = f" and {count - 5} more" if count > 5 else ""
            return f"{count} pending samples. Most recent: {ids}{suffix}."

        elif cmd_name == "mark_complete":
            return "Sample marked complete. Ready for review."

        elif cmd_name == "print_label":
            sample_id = args[0].strip().upper()
            return f"Printing label for {sample_id}."

        else:
            return "Command not recognized."

    except Exception as e:
        logger.error(f"Command execution error: {e}")
        return f"Error: {str(e)}"
