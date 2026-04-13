"""SENAITE JSON API Client — Handles all LIMS operations."""

import json
import logging
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from base64 import b64encode

logger = logging.getLogger("senaite")


class SenaiteClient:
    """Minimal SENAITE JSON API client for voice commands."""

    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.api_url = f"{self.base_url}/@@API/senaite/v1"
        credentials = b64encode(f"{username}:{password}".encode()).decode()
        self.auth_header = f"Basic {credentials}"

    def _request(self, method: str, endpoint: str, data: Optional[dict] = None) -> dict:
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
            logger.error(f"SENAITE HTTP {e.code}: {e.read().decode()[:200]}")
            raise
        except URLError as e:
            logger.error(f"SENAITE connection error: {e.reason}")
            raise

    def get(self, endpoint: str) -> dict:
        return self._request("GET", endpoint)

    def post(self, endpoint: str, data: dict) -> dict:
        return self._request("POST", endpoint, data)

    def search_samples(self, query: str = "", review_state: str = "sample_received") -> list:
        """Search samples by ID or get pending samples."""
        endpoint = f"AnalysisRequest?review_state={review_state}&sort_on=created&sort_order=descending&limit=25"
        if query:
            endpoint += f"&getId={query}"
        result = self.get(endpoint)
        return result.get("items", [])

    def get_sample(self, sample_id: str) -> Optional[dict]:
        """Get a single sample by ID."""
        items = self.search_samples(query=sample_id)
        return items[0] if items else None

    def create_sample(self, sample_id: str, sample_type: str = "Water", client_id: str = "client-1") -> dict:
        """Log a new sample."""
        return self.post("AnalysisRequest", {
            "getId": sample_id,
            "SampleType": sample_type,
            "Client": client_id,
        })

    def get_pending_samples(self) -> list:
        """Get all samples awaiting analysis."""
        return self.search_samples(review_state="sample_received")

    def record_result(self, sample_id: str, test_name: str, value: str) -> dict:
        """Record an analytical result for a specific test on a sample."""
        sample = self.get_sample(sample_id)
        if not sample:
            raise ValueError(f"Sample {sample_id} not found")

        # Find the analysis matching the test name
        analyses_url = sample.get("Analyses", "")
        if analyses_url:
            analyses = self.get(f"Analysis?getParentUID={sample['uid']}&getKeyword={test_name}")
            items = analyses.get("items", [])
            if items:
                analysis_uid = items[0]["uid"]
                return self.post(f"Analysis/{analysis_uid}", {"Result": value})

        raise ValueError(f"Test '{test_name}' not found on sample {sample_id}")

    def transition_sample(self, sample_id: str, action: str) -> dict:
        """Transition a sample (e.g., submit, verify, publish)."""
        sample = self.get_sample(sample_id)
        if not sample:
            raise ValueError(f"Sample {sample_id} not found")
        return self.post(f"AnalysisRequest/{sample['uid']}/transition/{action}", {})

    def ping(self) -> bool:
        """Check if SENAITE is reachable."""
        try:
            self.get("version")
            return True
        except Exception:
            return False
