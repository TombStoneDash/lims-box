"""SENAITE JSON API Client — Handles all LIMS operations.

Uses only stdlib (urllib) so there are no extra dependencies for the
SENAITE integration layer. All methods raise on HTTP errors so callers
can catch and queue commands for retry.
"""

import json
import logging
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from base64 import b64encode

logger = logging.getLogger("senaite.client")


class SenaiteClient:
    """Minimal SENAITE JSON API client for voice commands.

    Talks to SENAITE's @@API/senaite/v1 REST endpoint using Basic auth.
    Designed to be fully offline-tolerant — callers should check `ping()`
    before calling other methods and queue failures for later retry.
    """

    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.api_url = f"{self.base_url}/@@API/senaite/v1"
        credentials = b64encode(f"{username}:{password}".encode()).decode()
        self.auth_header = f"Basic {credentials}"

    # ── Low-level HTTP ───────────────────────────────────────────────────

    def _request(self, method: str, endpoint: str, data: Optional[dict] = None) -> dict:
        """Make an authenticated JSON request to SENAITE."""
        url = f"{self.api_url}/{endpoint.lstrip('/')}"
        body = json.dumps(data).encode() if data else None
        req = Request(url, data=body, method=method)
        req.add_header("Authorization", self.auth_header)
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")

        try:
            with urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode())
        except HTTPError as e:
            body_text = ""
            try:
                body_text = e.read().decode()[:300]
            except Exception:
                pass
            logger.error(f"SENAITE HTTP {e.code} on {method} {endpoint}: {body_text}")
            raise
        except URLError as e:
            logger.error(f"SENAITE connection error: {e.reason}")
            raise

    def get(self, endpoint: str) -> dict:
        return self._request("GET", endpoint)

    def post(self, endpoint: str, data: dict) -> dict:
        return self._request("POST", endpoint, data)

    # ── Connectivity ─────────────────────────────────────────────────────

    def ping(self) -> bool:
        """Check if SENAITE is reachable. Returns True/False, never raises."""
        try:
            self.get("version")
            return True
        except Exception:
            return False

    # ── Sample operations ────────────────────────────────────────────────

    def search_samples(
        self,
        query: str = "",
        review_state: str = "sample_received",
        limit: int = 25,
    ) -> list:
        """Search samples by ID or list by review state."""
        endpoint = (
            f"AnalysisRequest?review_state={review_state}"
            f"&sort_on=created&sort_order=descending&limit={limit}"
        )
        if query:
            endpoint += f"&getId={query}"
        result = self.get(endpoint)
        return result.get("items", [])

    def get_sample(self, sample_id: str) -> Optional[dict]:
        """Get a single sample by ID. Returns None if not found."""
        items = self.search_samples(query=sample_id, review_state="")
        return items[0] if items else None

    def create_sample(
        self,
        sample_id: str,
        sample_type: str = "Water",
        client_id: str = "client-1",
    ) -> dict:
        """Log a new sample in SENAITE."""
        return self.post("AnalysisRequest", {
            "getId": sample_id,
            "SampleType": sample_type,
            "Client": client_id,
        })

    def get_pending_samples(self) -> list:
        """Get all samples awaiting analysis (status: sample_received)."""
        return self.search_samples(review_state="sample_received")

    def record_result(self, sample_id: str, test_name: str, value: str) -> dict:
        """Record an analytical result for a specific test on a sample.

        Raises ValueError if the sample or test is not found.
        """
        sample = self.get_sample(sample_id)
        if not sample:
            raise ValueError(f"Sample {sample_id} not found")

        # Find the analysis matching the test name
        analyses = self.get(
            f"Analysis?getParentUID={sample['uid']}&getKeyword={test_name}"
        )
        items = analyses.get("items", [])
        if not items:
            raise ValueError(f"Test '{test_name}' not found on sample {sample_id}")

        analysis_uid = items[0]["uid"]
        return self.post(f"Analysis/{analysis_uid}", {"Result": value})

    def transition_sample(self, sample_id: str, action: str) -> dict:
        """Transition a sample workflow state (e.g., submit, verify, publish).

        Raises ValueError if the sample is not found.
        """
        sample = self.get_sample(sample_id)
        if not sample:
            raise ValueError(f"Sample {sample_id} not found")
        return self.post(
            f"AnalysisRequest/{sample['uid']}/transition/{action}", {}
        )
