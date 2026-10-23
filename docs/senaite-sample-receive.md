# SENAITE sample receive

`lib/senaite-sample-receive` exports `createSenaiteSampleReceiver()` for
server-side callers. `receive({ clientUid, sampleId })` moves one OHWorks sample
in SENAITE from `sample_due` to `sample_received` and reports it only after
SENAITE reads it back as received. Nothing calls it yet: no route, page, job or
voice command.

## Configuration

It is enabled only when both `SENAITE_BASE_URL` (the SENAITE site root, HTTPS,
no credentials, query or fragment) and `SENAITE_SAMPLE_RECEIVE_TOKEN` are set.
The read-only `SENAITE_API_TOKEN` never enables it. Keep both server-side,
never `NEXT_PUBLIC_`. The token needs a SENAITE account that may run the
`receive` transition, and nothing more.

## One receive does this

1. **Sign-in proof.** `GET users/current` must answer `authenticated: true`.
   SENAITE 2.6 treats a rejected token as Anonymous and still answers HTTP 200.
2. **Lookup.** `GET AnalysisRequest?getId=&getClientUID=&complete=yes`.
   senaite.jsonapi silently drops query keys that are not catalog indexes, so
   every returned record must echo both the sample ID and the client UID. If
   one doesn't, the call fails as `scope-mismatch` before any write. No match is
   `sample-not-found`; two are `ambiguous-sample`.
3. **State.** `sample_received` already: reported as received with
   `transitioned: false`, nothing is written. Any state other than
   `sample_due` is `not-receivable` (with the state).
4. **Write.** `POST update` with exactly `{ uid, transition: "receive" }`.
5. **Read-back.** `GET AnalysisRequest?UID=` must return that one sample, under
   the same client and ID, in `sample_received`. Only then is it `received`.

A lost write answer is settled by the read-back: received means success,
otherwise `write-unconfirmed`. An explicit refusal (HTTP error or 200
`success: false`) that left the sample due is `write-failed`. Retrying is always
safe: a received sample is never transitioned again.

HTTPS only, no redirects, 10 s timeout per request, no automatic retries, fixed
error codes only. Upstream bodies, URLs and credentials are never returned.

## Tests

`npm run test:senaite-receive` runs the acceptance suite against an in-memory
senaite.jsonapi stand-in (synthetic records) and replays the recorded real
SENAITE 2.6.0 rejected-token answer. `npm run test:all` discovers it too.

Not yet proven against a signed-in real server: that `update` with
`transition` runs `receive` there, and which role the token's account needs.
That needs a receive-capable account on a synthetic-data SENAITE.
