# SENAITE setup audit (OHWorks, point 2)

`lib/senaite-setup-audit` exports `createSenaiteSetupAuditor()` for server-side
callers. `audit(config)` builds the OHWorks setup plan with
`buildOHWorksSenaiteSetupPlan()` and checks it against a running SENAITE.
It sends GETs only and never creates, edits or deactivates anything.

Configuration is the same as `lib/senaite-read`: `SENAITE_BASE_URL` (HTTPS
site root, no embedded credentials, query or fragment) and a read-only
`SENAITE_API_TOKEN`. Missing or unsafe settings return `not_configured` and send
no request. A plan that fails the synthetic-only rules returns `invalid-plan`
before any request.

## What it does

1. GETs `@@API/senaite/v1/users/current` and continues only on
   `authenticated: true`. SENAITE 2.6 answers a rejected token with HTTP 200 as
   Anonymous, who sees empty setup folders; without this check every record
   would read as missing and the plan would recreate the whole lab.
2. GETs one listing per planned portal type (`Client`, `Contact`, `SampleType`,
   `Instrument`, `AnalysisCategory`, `AnalysisService`, `AnalysisProfile`,
   `LabContact`) with `complete=yes&limit=500`. It does not rely on catalog
   filters, which senaite.jsonapi silently ignores when they are not indexed.
   A listing that is only one page (`next` set, or `count` above the items) is
   `incomplete-listing`. A record of another portal type, a record without a
   UID or title, or an HTTP-200 `success: false` answer is `invalid-response`.
3. Matches each planned record: services by `Keyword`, contacts by title under
   the planned client's UID, everything else by title.

Each item is `present`, `missing`, `mismatch` (with reasons `inactive`,
`title`, `unit`, `category`, `model`, `services`, or `unreadable-field`),
`ambiguous` (several matches, nothing guessed), or `blocked` (missing, but a
prerequisite is a mismatch or ambiguous). `ready` is true only when every item
is `present`. `remaining` lists the missing steps in plan order; a reference to
a record SENAITE already has becomes `{ $uid }`, and a reference to another
remaining step stays `{ $ref }`. Nothing is planned on top of a mismatch or an
ambiguous record.

## Tests

- `npm run test:senaite-setup`: the in-memory senaite.jsonapi stand-in
  (empty lab → full plan → create → `ready`; partial setup; every mismatch
  reason; ambiguity; foreign contacts; unreadable fields; one-page listings) and
  replays of responses recorded from a real SENAITE 2.6.0 server.
- `npm run test:senaite-live`: opt-in, against a running SENAITE through an SSH
  tunnel. With `SENAITE_LIVE_READ_TOKEN` it prints the audit (statuses only, no
  values or secrets) as the receipt for point 2.

Still unproven on a real server: the signed-in listing field names
(`Keyword`, `Unit`, `Category`, `Model`, `Service`) for SENAITE 2.6. Fields the
audit cannot read are reported as `unreadable-field`, never as a match.
