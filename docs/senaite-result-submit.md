# SENAITE result submission

One SENAITE-backed slice of the ten-point OHWorks/SENAITE ask: **an analyst
submits a result in SENAITE**. It is the step between the LIAISON XL import
(#782), which writes values but leaves them unsubmitted, and four-eyes
verification (#788), which only accepts `to_be_verified` results. Nothing calls
it yet: no route, page or job.

```ts
const submitter = createSenaiteResultSubmitter();
const result = await submitter.submit(
  { clientUid, sampleId, analysisUid, keyword, expectedResult, expectedOperand, analystUserId },
  { analystToken },
);
```

## Why the analyst's own token

SENAITE records whoever the token signs in as as the submitter
(`getSubmittedBy`), and four-eyes verification compares the reviewer against
that record. A shared service token would record the service account, so the
same person could submit and then verify their own result. This module
therefore has **no environment token**. Each call carries the analyst's own
SENAITE token, held server-side, and the token must sign in as `analystUserId`
(login name or user id, case-insensitive). A token for anyone else, including a
service account, is refused as `analyst-mismatch` before any sample is read.
`analystUserId` comes from the signed-in OHWorks session, never from browser
input. The read-only, import and verify tokens never enable it.

`SENAITE_BASE_URL` follows [senaite-read.md](./senaite-read.md): HTTPS site root,
no embedded credentials, no redirects, 10 s timeout, no retries. A missing or
invalid URL sends no request.

## What it does

1. Proves sign-in: `users/current` must say `authenticated: true` (SENAITE 2.6
   answers a bad token with HTTP 200 as Anonymous), then matches the analyst.
2. Finds the one sample under that client. Every record must echo the ID and the
   client, because senaite.jsonapi silently drops filters it doesn't index.
3. Picks the analysis by **UID** under that sample, so a retest is never swapped
   in. Every listed analysis must have the sample as `parent_uid`, and the listing
   must be one page of at most 100.
4. **Seen value:** `Result` and `DetectionLimitOperand` must equal what the
   analyst saw, or the call is refused (`result-mismatch`). An empty result never
   matches.
5. State: `unassigned` or `assigned` can be submitted. `to_be_verified`,
   `verified` and `published` come back as `already_submitted` with nothing
   written and no claim about who submitted. Anything else (`retracted`,
   `rejected`, …) is `not-submittable`. The sample must be `sample_received`.
6. Sends only `{ uid, transition: "submit" }`. It reports `submitted` only when
   SENAITE accepted the write **and** the read-back shows the same value as
   `to_be_verified` with `getSubmittedBy` naming this analyst. If SENAITE names
   someone else, the answer is `submitter-unattributed`. A read-back without an
   accepted answer (lost answer, or another user got there first) is
   `write-unconfirmed`, never `submitted`. An explicit refusal that left the
   analysis open is `write-failed`.

Errors are fixed codes. User names, upstream bodies and tokens are never returned.

## Tests

- `npm run test:senaite-submit`: an in-memory senaite.jsonapi stand-in
  (synthetic records) whose `update` applies SENAITE's submit guard and records
  the token's user as submitter. It covers dropped filters, retests, paging,
  service-account tokens, lost/refused/raced/ignored writes, changed results and
  a misattributed submitter, and replays the recorded real SENAITE 2.6.0
  rejected-token answer.
- `npm run test:senaite-submit-live`: opt-in against a real synthetic-data
  SENAITE (see the test header for the variables).

## Not proven yet

- Against a signed-in real server: that `update` + `transition: "submit"` works
  through a Bearer token, and that the listing carries `getSubmittedBy`. If it
  doesn't, every submit ends as `submitter-unattributed`, never `submitted`.
- How each analyst's token is issued and stored. Until that exists, nothing can
  call this.
- A result changed between the pre-check and the write is submitted with the new
  value. The read-back then reports `write-unconfirmed`, but SENAITE has
  already submitted it, so a reviewer must catch it at verification.
