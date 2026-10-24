"""SENAITE JSON API Client — Handles all LIMS operations.

Uses only stdlib (urllib) so there are no extra dependencies for the
SENAITE integration layer. All methods raise on HTTP errors so callers
can catch and queue commands for retry.
"""

import json
import logging
from collections.abc import Mapping
from typing import Optional
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit
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
        body = json.dumps(data).encode() if data is not None else None
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

    def require_authenticated(self) -> None:
        """Raise unless SENAITE confirms these credentials are signed in.

        SENAITE 2.6 answers rejected credentials with HTTP 200 as Anonymous,
        who sees no samples, so an empty sample read is trusted only after this.
        """
        result = self.get("users/current")
        items = result.get("items") if isinstance(result, Mapping) else None
        if (not isinstance(items, list) or len(items) != 1
                or not isinstance(items[0], Mapping)
                or type(items[0].get("authenticated")) is not bool):
            raise ValueError("Invalid SENAITE identity response")
        if not items[0]["authenticated"]:
            raise PermissionError("SENAITE did not accept the configured credentials")

    # ── Sample operations ────────────────────────────────────────────────

    def search_samples(
        self,
        query: str = "",
        review_state: str = "sample_received",
        limit: int = 25,
    ) -> list:
        """Search samples by ID or list by review state."""
        params = {
            "review_state": review_state,
            "sort_on": "created",
            "sort_order": "descending",
            "limit": limit,
        }
        if query:
            params["getId"] = query
        endpoint = f"AnalysisRequest?{urlencode(params)}"
        result = self.get(endpoint)
        items = result.get("items", [])
        if not items:
            self.require_authenticated()
        return items

    def get_sample(self, sample_id: str) -> Optional[dict]:
        """Get one sample, returning None if absent; reject ambiguous or invalid targets."""
        items = self.search_samples(query=sample_id, review_state="")
        if not items:
            return None
        if len(items) != 1:
            raise ValueError(f"Multiple samples match sample {sample_id}")

        sample = items[0]
        uid = sample.get("uid") if isinstance(sample, Mapping) else None
        if not isinstance(uid, str) or not uid.strip():
            raise ValueError(f"Sample {sample_id} has an invalid UID")
        identity_field = "getId" if "getId" in sample else "id"
        if identity_field in sample and sample[identity_field] != sample_id:
            raise ValueError(
                f"Sample lookup for {sample_id!r} returned mismatching "
                f"{identity_field}: {sample[identity_field]!r}"
            )
        return sample

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
        """Get the complete pending collection or raise if batching is inconsistent.

        SENAITE JSONAPI batches expose a total ``count`` and a ``next`` URL
        containing ``b_start``. Keep the pending filter on every request and
        never send credentials to a URL supplied by the response.
        """
        params = {
            "review_state": "sample_received",
            "sort_on": "created",
            "sort_order": "descending",
            "limit": 25,
            "b_start": 0,
        }
        collection_url = f"{self.api_url}/AnalysisRequest"
        collection = urlsplit(collection_url)
        items = []
        seen_uids = set()
        total = None
        while True:
            result = self.get(f"AnalysisRequest?{urlencode(params)}")
            if not isinstance(result, Mapping):
                raise ValueError("Invalid pending samples page")
            count = result.get("count")
            batch = result.get("items")
            if (type(count) is not int or count < 0
                    or not isinstance(batch, list) or "next" not in result):
                raise ValueError("Missing or invalid pending samples pagination")
            if total is None:
                total = count
            if count != total:
                raise ValueError("Pending samples count changed during pagination")
            for sample in batch:
                uid = sample.get("uid") if isinstance(sample, Mapping) else None
                if not isinstance(uid, str) or not uid.strip():
                    raise ValueError("Pending sample has an invalid UID")
                if uid in seen_uids:
                    raise ValueError("Repeated pending sample in pagination")
                seen_uids.add(uid)
            items.extend(batch)
            if len(items) > total:
                raise ValueError("Pending samples exceed pagination count")

            next_url = result["next"]
            if next_url is None:
                if len(items) != total:
                    raise ValueError("Incomplete pending samples pagination")
                if not items:
                    self.require_authenticated()
                return items
            if not batch or len(items) == total:
                raise ValueError("Pending samples pagination made no progress")
            if not isinstance(next_url, str) or not next_url.strip():
                raise ValueError("Invalid pending samples next link")
            link = urlsplit(urljoin(collection_url, next_url))
            if (link.scheme != collection.scheme or link.netloc != collection.netloc
                    or link.path != collection.path or link.fragment):
                raise ValueError("Invalid pending samples next link target")
            offsets = parse_qs(link.query).get("b_start", [])
            if len(offsets) != 1 or not offsets[0].isascii() or not offsets[0].isdigit():
                raise ValueError("Invalid pending samples pagination offset")
            offset = int(offsets[0])
            if offset != len(items) or offset <= params["b_start"]:
                raise ValueError("Repeated or incomplete pending samples pagination offset")
            params["b_start"] = offset

    def record_result(self, sample_id: str, test_name: str, value: str) -> dict:
        """Record an analytical result for a specific test on a sample.

        Raises ValueError if the sample or test is not found, or the analysis
        target is ambiguous or malformed.
        """
        sample = self.get_sample(sample_id)
        if not sample:
            raise ValueError(f"Sample {sample_id} not found")

        # Find the analysis matching the test name
        params = {"getParentUID": sample["uid"], "getKeyword": test_name}
        analyses = self.get(f"Analysis?{urlencode(params)}")
        items = analyses.get("items", [])
        if not items:
            raise ValueError(f"Test '{test_name}' not found on sample {sample_id}")

        if len(items) != 1:
            raise ValueError(
                f"Multiple analyses match test '{test_name}' on sample {sample_id}"
            )

        target = items[0]
        analysis_uid = target.get("uid") if isinstance(target, dict) else None
        if not isinstance(analysis_uid, str) or not analysis_uid.strip():
            raise ValueError(
                f"Analysis for test '{test_name}' on sample {sample_id} has an invalid UID"
            )
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
