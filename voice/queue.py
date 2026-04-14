"""Offline command queue — stores commands when SENAITE is unreachable
and replays them when connectivity is restored.

Uses SQLite for persistence so queued commands survive restarts.
"""

import sqlite3
import json
import time
import logging
import threading
from typing import List, Tuple, Callable, Optional

from voice.config import RETRY_INTERVAL, MAX_RETRY_ATTEMPTS

logger = logging.getLogger("voice.queue")


class CommandQueue:
    """SQLite-backed command queue for offline resilience.

    Commands are stored when SENAITE is unreachable and drained
    automatically by a background thread when connectivity returns.
    """

    def __init__(self, db_path: str = "voice_command_queue.db"):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._lock = threading.Lock()
        self._drain_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        with self._lock:
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

        pending = self.count()
        if pending > 0:
            logger.info(f"Command queue loaded with {pending} pending commands")

    def enqueue(self, cmd_name: str, args: tuple) -> int:
        """Add a command to the retry queue."""
        with self._lock:
            cursor = self.conn.execute(
                "INSERT INTO pending_commands (cmd_name, args, created_at) VALUES (?, ?, ?)",
                (cmd_name, json.dumps(args), time.time()),
            )
            self.conn.commit()
            row_id = cursor.lastrowid
        logger.info(f"Queued command: {cmd_name} (id={row_id})")
        return row_id

    def get_pending(self, limit: int = 10) -> List[Tuple[int, str, tuple]]:
        """Get pending commands ordered by creation time."""
        with self._lock:
            rows = self.conn.execute(
                "SELECT id, cmd_name, args FROM pending_commands "
                "WHERE attempts < ? ORDER BY created_at ASC LIMIT ?",
                (MAX_RETRY_ATTEMPTS, limit),
            ).fetchall()
        return [(row[0], row[1], tuple(json.loads(row[2]))) for row in rows]

    def mark_done(self, command_id: int) -> None:
        """Remove a successfully executed command."""
        with self._lock:
            self.conn.execute("DELETE FROM pending_commands WHERE id = ?", (command_id,))
            self.conn.commit()

    def mark_failed(self, command_id: int, error: str) -> None:
        """Record a failed attempt."""
        with self._lock:
            self.conn.execute(
                "UPDATE pending_commands SET attempts = attempts + 1, last_error = ? WHERE id = ?",
                (error, command_id),
            )
            self.conn.commit()

    def purge_exhausted(self) -> int:
        """Remove commands that have exceeded MAX_RETRY_ATTEMPTS."""
        with self._lock:
            cursor = self.conn.execute(
                "DELETE FROM pending_commands WHERE attempts >= ?",
                (MAX_RETRY_ATTEMPTS,),
            )
            self.conn.commit()
            removed = cursor.rowcount
        if removed:
            logger.warning(f"Purged {removed} commands that exceeded retry limit")
        return removed

    def count(self) -> int:
        with self._lock:
            row = self.conn.execute("SELECT COUNT(*) FROM pending_commands").fetchone()
        return row[0] if row else 0

    def start_drain_loop(
        self,
        execute_fn: Callable[[str, tuple], str],
        ping_fn: Callable[[], bool],
        speak_fn: Optional[Callable[[str], None]] = None,
    ) -> None:
        """Start a background thread that drains the queue when SENAITE comes back online.

        Args:
            execute_fn: Function(cmd_name, args) -> response string
            ping_fn: Function() -> bool indicating SENAITE connectivity
            speak_fn: Optional function to speak status updates
        """
        if self._drain_thread and self._drain_thread.is_alive():
            return  # already running

        self._stop_event.clear()

        def _loop():
            while not self._stop_event.is_set():
                self._stop_event.wait(RETRY_INTERVAL)
                if self._stop_event.is_set():
                    break

                pending_count = self.count()
                if pending_count == 0:
                    continue

                if not ping_fn():
                    logger.debug(f"SENAITE still offline, {pending_count} commands queued")
                    continue

                logger.info(f"SENAITE back online — draining {pending_count} queued commands")
                if speak_fn:
                    speak_fn(f"SENAITE is back online. Processing {pending_count} queued commands.")

                for cmd_id, cmd_name, args in self.get_pending(limit=50):
                    if self._stop_event.is_set():
                        break
                    try:
                        response = execute_fn(cmd_name, args)
                        self.mark_done(cmd_id)
                        logger.info(f"Queue drain: {cmd_name} (id={cmd_id}) -> {response}")
                    except Exception as e:
                        self.mark_failed(cmd_id, str(e))
                        logger.warning(f"Queue drain failed: {cmd_name} (id={cmd_id}): {e}")

                self.purge_exhausted()

                remaining = self.count()
                if remaining == 0 and speak_fn:
                    speak_fn("All queued commands have been processed.")
                elif remaining > 0 and speak_fn:
                    speak_fn(f"{remaining} commands still pending.")

        self._drain_thread = threading.Thread(target=_loop, name="queue-drain", daemon=True)
        self._drain_thread.start()
        logger.info("Queue drain loop started")

    def stop_drain_loop(self) -> None:
        """Signal the drain loop to stop."""
        self._stop_event.set()
        if self._drain_thread:
            self._drain_thread.join(timeout=5)

    def close(self) -> None:
        self.stop_drain_loop()
        self.conn.close()
