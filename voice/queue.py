"""Offline command queue — stores commands when SENAITE is unreachable."""

import sqlite3
import json
import time
import logging
from typing import List, Tuple

logger = logging.getLogger("voice.queue")


class CommandQueue:
    """SQLite-backed command queue for offline resilience."""

    def __init__(self, db_path: str = "voice_command_queue.db"):
        self.conn = sqlite3.connect(db_path)
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS pending_commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cmd_name TEXT NOT NULL,
                args TEXT NOT NULL,
                created_at REAL NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT
            )
        """)
        self.conn.commit()

    def enqueue(self, cmd_name: str, args: tuple) -> int:
        """Add a command to the retry queue."""
        cursor = self.conn.execute(
            "INSERT INTO pending_commands (cmd_name, args, created_at) VALUES (?, ?, ?)",
            (cmd_name, json.dumps(args), time.time()),
        )
        self.conn.commit()
        logger.info(f"Queued command: {cmd_name} (id={cursor.lastrowid})")
        return cursor.lastrowid

    def get_pending(self, limit: int = 10) -> List[Tuple[int, str, tuple]]:
        """Get pending commands ordered by creation time."""
        rows = self.conn.execute(
            "SELECT id, cmd_name, args FROM pending_commands ORDER BY created_at ASC LIMIT ?",
            (limit,),
        ).fetchall()
        return [(row[0], row[1], tuple(json.loads(row[2]))) for row in rows]

    def mark_done(self, command_id: int) -> None:
        """Remove a successfully executed command."""
        self.conn.execute("DELETE FROM pending_commands WHERE id = ?", (command_id,))
        self.conn.commit()

    def mark_failed(self, command_id: int, error: str) -> None:
        """Record a failed attempt."""
        self.conn.execute(
            "UPDATE pending_commands SET attempts = attempts + 1, last_error = ? WHERE id = ?",
            (error, command_id),
        )
        self.conn.commit()

    def count(self) -> int:
        row = self.conn.execute("SELECT COUNT(*) FROM pending_commands").fetchone()
        return row[0] if row else 0

    def close(self):
        self.conn.close()
