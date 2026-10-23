# SENAITE result verification (four-eyes)

`lib/senaite-result-verify` exports `createSenaiteResultVerifier()` for
server-side callers. `verify({ clientUid, sampleId, keyword })` moves one
submitted OHWorks result in SENAITE from `to_be_verified` to `verified` and
reports it only after SENAITE reads it back as verified. It is the review step
after the LIAISON XL import (point 5), which lands results unsubmitted. Nothing
calls it yet: no route, page, job or voice command.

## Configuration

Enabled only when `SENAITE_BASE_URL` (the SENAITE site root, HTTPS, no
credentials, query or fragment) and `SENAITE_RESULT_VERIFY_TOKEN` are set. The
read-only `SENAITE_API_TOKEN` and the import `SENAITE_RESULT_IMPORT_TOKEN` never
enable it. Keep both server-side, never `NEXT_PUBLIC_`. The token's SENAITE
account must be a reviewer (allowed to run `verify`) and must not be the
account that submits results.

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
   the listing must be one page (a `next` link is `invalid-response`). Retracted,
   rejected and cancelled analyses are ignored, so a retest is the one verified.
   No live match is `analysis-not-found`; two are `ambiguous-analysis`.
4. **State.** Already `verified`: reported with `transitioned: false`, nothing
   written. Any state other than `to_be_verified` is `not-verifiable` (with the
   state). An empty `Result` is `no-result`.
5. **Four-eyes.** The analysis `getSubmittedBy` must be present
   (`submitter-unknown` otherwise) and differ from the signed-in username,
   ignoring case (`self-verification` otherwise). This holds even if SENAITE's
   own "allow self-verification" setting is on. `getSubmittedBy` is a user id
   and `users/current` gives the login name; they match on a default SENAITE,
   but not when the site logs in by email, so an email-shaped login is refused
   as `verifier-unknown`. Usernames are compared, never returned.
6. **Write.** `POST update` with exactly `{ uid, transition: "verify" }`.
7. **Read-back.** The same analysis listing must show that analysis
   `verified`, with the same keyword and the same `Result` that was reviewed.
   Only then is it `verified`.

A lost write answer is settled by the read-back: verified means success,
otherwise `write-unconfirmed`. An explicit refusal (HTTP error or 200
`success: false`) that left the result `to_be_verified` is `write-failed`.
Retrying is always safe: a verified result is never transitioned again.

HTTPS only, no redirects, 10 s timeout per request, no automatic retries, fixed
error codes only. Upstream bodies, URLs, usernames and credentials are never
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
no second write.

Not yet proven against a signed-in real server: that `update` with
`transition: "verify"` runs there through a Bearer token, and that the analysis
listing carries `getSubmittedBy`. If it does not, every verify fails closed as
`submitter-unknown` rather than skipping the four-eyes check.
