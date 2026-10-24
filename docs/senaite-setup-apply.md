# SENAITE setup apply (OHWorks, point 2)

`lib/senaite-setup-apply` exports `createSenaiteSetupApplier()` for server-side
callers. `applySetup(config, { containers, defaults?, apply? })` creates the
OHWorks setup in a running SENAITE through senaite.jsonapi. It is the write
side of `lib/senaite-setup-audit` (see `docs/senaite-setup-audit.md`): the
audit says what is missing, and this module creates exactly that.

Configuration: `SENAITE_BASE_URL` (HTTPS site root, no embedded credentials,
query or fragment) and its own `SENAITE_SETUP_TOKEN`. The read-only
`SENAITE_API_TOKEN` never enables it. Missing or unsafe settings return
`not_configured` and send no request. Nothing in the app calls it yet.

## What it does

1. Runs the audit with the setup token (sign-in proof, then one listing per
   planned portal type). Anonymous is `unauthenticated`. Any `mismatch`,
   `ambiguous` or `blocked` item is `setup-conflict`, returned with the audit
   items, and nothing is written. A human fixes that record in SENAITE.
2. Builds one `@@API/senaite/v1/create` body per missing step, in plan order.
   Without `apply: true` it stops here and returns `planned` with those bodies.
   A reference to a record created earlier in the same run is shown as
   `{ $ref }`.
3. With `apply: true`, every body is built first, so a bad option never leaves
   a half-made lab. Then for each step it POSTs the create, requires exactly
   one UID back, and reads the record back by UID (`complete=yes`). The read
   back must echo the UID, the portal type and the planned title (and the
   keyword for a service). Only then may a later step point at it.
4. Re-runs the audit. The result is `applied` only when the audit is `ready`
   and every UID it found is the UID this run created.

Field names sent:

| Type | Fields |
|---|---|
| Client | `parent_path`, `title`, `Name`, `ClientID` |
| Contact | `parent_uid` (the client), `Firstname`, `Surname` |
| LabContact | `parent_path`, `Firstname`, `Surname` |
| SampleType, AnalysisCategory | `parent_path`, `title` |
| Instrument | `parent_path`, `title`, `Model` |
| AnalysisService | `parent_path`, `title`, `Keyword`, `Unit`, `Category` (UID) |
| AnalysisProfile | `parent_path`, `title`, `ProfileKey`, `Service` (UIDs) |

SENAITE builds a person's title from Firstname + Surname, so a planned person
title is split at its last space.

`containers` names the `parent_path` for every type except Contact. The setup
folders differ between SENAITE versions, so the operator supplies them; they
must be absolute paths without `.` or `..` segments. `defaults` adds fixed
fields SENAITE requires that the plan does not carry, such as a `Department`
UID for AnalysisCategory or `Prefix` for SampleType. A default may not replace
a field the module sets, and credential-like names are refused.

Error codes: `invalid-plan`, `invalid-options`, `unauthenticated`,
`request-failed`, `invalid-response`, `incomplete-listing`, `setup-conflict`,
`write-failed` (HTTP error or `success: false`), `write-unconfirmed` (lost
answer, read-back mismatch, or a final audit that is not ready). An error
lists the records this run created and read back before it stopped. Re-running
after a lost answer audits first, finds the record and does not create it again.

## Tests

`npm run test:senaite-setup` includes `tests/senaite-setup-apply/apply.test.ts`
(12 cases): dry run, then apply, then read-back, then a no-op re-run; exact
create bodies and UID wiring; partial setups; config refusal; Anonymous
tokens; conflicts; bad options; silently ignored fields; stored title drift;
lost answers; refused and HTTP 500 creates; a read-back that ignores the UID
filter.

Mutation check: removing the read-back, the conflict stop, the dry-run gate,
the final-audit confirmation, the audit error return, the protected-field
check, the build-all-before-write pass, or option validation each makes at
least one test fail.

Still unproven on a real server: the senaite.jsonapi 2.6 `create` field names
above, the setup folder paths, and which extra fields SENAITE requires. A wrong
assumption fails as `write-failed` or `write-unconfirmed`; it is never reported
as applied. Proving it needs a synthetic-data SENAITE and a setup token.
