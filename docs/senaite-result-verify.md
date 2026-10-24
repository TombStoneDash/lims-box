# SENAITE result verification (four-eyes)

`lib/senaite-result-verify` exports `createSenaiteResultVerifier()` for
server-side callers. `verify({ clientUid, sampleId, analysisUid, keyword,
expectedResult, expectedOperand?, reviewerUserId })` moves one submitted
OHWorks result in SENAITE from `to_be_verified` to `verified`, once a reviewer
other than the submitter has approved that exact value. It is the review step
after the LIAISON XL import (point 5), which lands results unsubmitted. Nothing
calls it yet: no route, page, job or voice command.

## Configuration

Enabled only when `SENAITE_BASE_URL` (the SENAITE site root, HTTPS, no
credentials, query or fragment) and `SENAITE_RESULT_VERIFY_TOKEN` are set. The
read-only `SENAITE_API_TOKEN` and the import `SENAITE_RESULT_IMPORT_TOKEN` never
enable it. Keep both server-side, never `NEXT_PUBLIC_`. The token belongs to a
SENAITE service account allowed to run `verify`, which never submits results.

Because the token is shared, it says nothing about who approved. The caller
must pass `reviewerUserId`, the SENAITE user id of the person approving, taken
from the signed-in OHWorks session on the server and never from browser
input. SENAITE's own audit trail will name the service account as verifier;
the caller must record the reviewer itself.

## One verify does this

1. **Sign-in proof.** `GET users/current` must answer `authenticated: true`
   with a username. SENAITE 2.6 treats a rejected token as Anonymous and still
   answers HTTP 200.
2. **Sample.** `GET AnalysisRequest?getId=&getClientUID=&complete=yes`. Every
   returned record must echo both the sample ID and the client UID, because
   senaite.jsonapi silently drops query keys that are not catalog indexes.
   Otherwise `scope-mismatch`; none is `sample-not-found`, two `ambiguous-sample`.
3. **Analysis.** `GET Analysis?getRequestUID=&complete=yes&limit=100`. Every
   analysis must have that sample as `parent_uid` (else `scope-mismatch`), and
   the listing must be one page of at most 100 (else `invalid-response`). The
   analysis is picked by `analysisUid`, never by keyword, so a retest (a new
   UID) is never swapped in for the value that was reviewed. Missing is
   `analysis-not-found`; a different keyword is `scope-mismatch`.
4. **Reviewed value.** `Result` and `DetectionLimitOperand` must equal
   `expectedResult` and `expectedOperand` (default none), else `result-mismatch`.
5. **State.** Already `verified`: `already_verified`, nothing written, and no
   claim about who verified it or whether four-eyes held. Any state other than
   `to_be_verified` is `not-verifiable` (with the state).
6. **Four-eyes.** `getSubmittedBy` must be present (`submitter-unknown`
   otherwise). It must differ, ignoring case, from `reviewerUserId` and from
   the token account's login name and user id (read from `api_url`), else
   `self-verification`. This holds even if SENAITE's own "allow
   self-verification" setting is on. Names are compared, never returned.
7. **Write.** `POST update` with exactly `{ uid, transition: "verify" }`.
8. **Read-back.** `verified` is reported only if SENAITE accepted the write and
   the same listing then shows that analysis `verified` with the reviewed value.

Without an accepted answer, a verified read-back may be someone else's verify,
so it is `write-unconfirmed`; re-running then reports `already_verified`. An
explicit refusal (HTTP error or 200 `success: false`) that left the result
`to_be_verified` is `write-failed`. A verified result is never transitioned
again. Once the sample is published, the analysis is `published` and verify
answers `not-verifiable`.

Not handled: multi-verification setups. When SENAITE requires more than one
verification it refuses `verify`, and this answers `write-failed`.

HTTPS only, no redirects, 10 s timeout per request, no automatic retries, fixed
error codes only. Upstream bodies, URLs, user names and credentials are never
returned.

## Tests

`npm run test:senaite-verify` runs the acceptance suite against an in-memory
senaite.jsonapi stand-in (synthetic records, including dropped-filter and
lost-answer cases) and replays the recorded real SENAITE 2.6.0 rejected-token
answer. `npm run test:all` discovers it too.

`npm run test:senaite-verify-live` is opt-in against a running synthetic-data
SENAITE (see the test header). With only `SENAITE_LIVE_ORIGIN` it proves a
rejected token verifies nothing on the real server. With a reviewer token and a
result submitted by another user, it verifies that result and re-runs to prove
the second call reports `already_verified` without writing.

Not yet proven against a signed-in real server: that `update` with
`transition: "verify"` runs there through a Bearer token, and that the analysis
listing carries `getSubmittedBy` and `DetectionLimitOperand`, and whether a
signed-in `users/current` `api_url` ends in the user id (if not, only the login
name is compared for the token account). If `getSubmittedBy` is missing, every verify fails closed
as `submitter-unknown` rather than skipping the four-eyes check.
