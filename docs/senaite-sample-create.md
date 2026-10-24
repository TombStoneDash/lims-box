# SENAITE sample create

`lib/senaite-sample-create` exports `createSenaiteSampleCreateAdapter(mapping)`,
the SENAITE side of `createOHWorksSenaiteSample` in `lib/ohworks-senaite-create.ts`.
That contract already validated the OHWorks request and re-checked whatever an
injected adapter reported; until now no adapter talked to SENAITE. This one
creates the sample through senaite.jsonapi and reports it only after SENAITE
reads it back as asked. No route, page, job or voice command calls it yet.

## Configuration

It needs `SENAITE_BASE_URL` (the site root, HTTPS only, no credentials, query or
fragment) and its own write credential, `SENAITE_SAMPLE_CREATE_TOKEN`. The
read-only `SENAITE_API_TOKEN` never enables it. Keep both server-side.

The mapping says which SENAITE objects the OHWorks codes mean. Every value is a
SENAITE UID (32 lowercase hex characters); one malformed value disables the
adapter:

```ts
createSenaiteSampleCreateAdapter({
  tenants: { 'tenant-a': { clientUid: '…', contactUid: '…' } },
  sampleTypes: { 'water-potable': '…' },
  services: { lead: '…', ph: '…' },
});
```

An unmapped tenant, matrix or analysis code fails as `unmapped` with no request.

## What one create does

1. `GET users/current` must answer `authenticated: true`. SENAITE 2.6 answers a
   rejected token with HTTP 200 as Anonymous, so without this a write would be
   attempted as Anonymous.
2. `GET AnalysisRequest?getClientUID=…&getClientSampleID=…` looks for an earlier
   attempt with the same OHWorks sample ID. senaite.jsonapi drops query keys
   that are not catalog indexes, so every returned record must echo both
   values or the call fails as `scope-mismatch` before any write. Two matches
   are `duplicate-existing`; one match is reused instead of creating another.
3. Otherwise `POST create` with exactly `portal_type`, `parent_uid`, `Client`,
   `Contact`, `SampleType`, `DateSampled`, `ClientSampleID` and `Analyses`
   (service UIDs). `DateReceived` is not sent; SENAITE sets it when the sample
   is received.
4. `GET AnalysisRequest?UID=…` reads the sample back. Its client, client sample
   ID and sample type must match and its state must be a fresh one
   (`sample_due`, `sample_received`, `to_be_sampled`, `scheduled_sampling`,
   `to_be_preserved`).
5. `GET Analysis?getRequestUID=…` must return exactly the requested services,
   each with `parent_uid` equal to the sample.

Only then is the SENAITE sample ID returned to the contract, which reports
`CREATED`. Any thrown error becomes the contract's `adapter-error`.

## Errors

`SenaiteSampleCreateError.code` is one of `not-configured`, `unmapped`,
`unauthenticated`, `request-failed`, `invalid-response`, `scope-mismatch`,
`duplicate-existing`, `existing-conflict` (an earlier sample with this ID does
not match the request), `write-failed` (HTTP error or `success: false`) and
`write-unconfirmed`. Messages carry the code only, never upstream bodies.

A lost or unreadable create answer is `write-unconfirmed`, because SENAITE may
have stored the sample. Retrying the same request is safe: step 2 finds it and
no second sample is created. There are no automatic retries, redirects or
followed links; every request times out after 10 seconds.

## Tests and what is still unproven

`npm run test:senaite-sample-create` runs the acceptance tests against an
in-memory senaite.jsonapi stand-in that, like the real API, answers Anonymous
callers with HTTP 200 and can drop unindexed filters. It also replays the
recorded real SENAITE 2.6.0 rejected-token answer from
`tests/senaite-read/fixtures/recorded`. `npm run test:all` discovers the file.

No create has run against a real server: that needs a write-capable SENAITE
account on a sandbox site. `npm run test:senaite-sample-create-live` is the
opt-in acceptance test for that. With only `SENAITE_LIVE_ORIGIN` set it checks
that a rejected token stops at `users/current`. With `SENAITE_LIVE_CREATE_TOKEN`,
`SENAITE_LIVE_CREATE_MAPPING` and `SENAITE_LIVE_CREATE_CONFIRM=synthetic-sandbox`
as well, it creates one `LIMSBOX-LIVE-*` sample, retries the same request to
prove no second sample is created, and cross-checks the stored sample's
`parent_uid` against the mapped Client (see the test header). Whether the real sample catalog returns
`getClientSampleID` and `getSampleTypeUID` in listings, and analyses return
`getServiceUID` and `parent_uid`, is unproven. If a field is missing the create
fails closed as `write-unconfirmed` or `scope-mismatch`; it never reports a
sample it could not confirm.
