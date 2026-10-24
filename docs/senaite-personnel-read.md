# SENAITE personnel roster

Point 6 of Hudson's ten-point OHWorks/SENAITE ask is the London personnel
module, and the ask's rule is "nothing the customer sees may come from a JSON
file". Today the personnel views name staff from `data/synthetic/personnel.json`
and `fixtures/ohworks/supervised-demo`. `lib/senaite-personnel-read` is the
SENAITE source for that roster: it reads the lab's `LabContact` records, the
same records the setup plan (`lib/ohworks-senaite-setup-plan.ts`, `labUsers`)
creates. Nothing calls it yet (no route, page, job or voice command).

## Use

```ts
const roster = await createSenaitePersonnelReader().listLabContacts();
```

Configuration is the same as `lib/senaite-read`: `SENAITE_BASE_URL` (HTTPS site
root, no credentials, query or fragment) and a read-only `SENAITE_API_TOKEN`,
both server-side. Missing or unsafe configuration is `not_configured` and sends
nothing.

## What a read does

1. GETs `@@API/senaite/v1/users/current` and continues only on an explicit
   `authenticated: true`. Real SENAITE 2.6.0 answers a rejected token with HTTP
   200 as Anonymous and an empty list, so without this a bad token would look
   like a lab with no staff. A replay of that recorded answer is in the tests.
2. GETs `@@API/senaite/v1/LabContact?complete=yes&limit=100`. No catalog
   filters, because senaite.jsonapi silently drops unindexed ones.

Each read is two GETs with `redirect: 'error'`, `no-store`, `credentials: omit`
and a 10-second timeout. No retries, no pagination, no writes.

## Results

`ok` returns `{ uid, id, fullName, jobTitle, active }` per contact, sorted by
name. `active` is `true`/`false` from SENAITE's `active`/`inactive` state and
`null` when SENAITE didn't say. Email, phone, address, signature, linked login
and departments are dropped inside the module.

Errors are fixed codes with no upstream text:

| code | meaning |
|---|---|
| `unauthenticated` | SENAITE did not accept the token; the roster was not requested |
| `request-failed` | HTTP error, redirect, timeout or transport failure |
| `invalid-response` | not JSON, `success: false`, malformed or duplicate record, wrong portal type, unknown review state, more than 100 items |
| `incomplete-listing` | SENAITE reports more contacts than one page (`next` set or `count` above the items); a partial roster is never shown |
| `non-synthetic-record` | a contact's title doesn't start with `SYNTHETIC-` (see below) |

## Synthetic-only guard

By default every contact title must start with `SYNTHETIC-`, matching the setup
plan's own rule. The OHWorks server holds synthetic data only, so a real name
there is a setup mistake. One such record fails the whole roster, and the error
doesn't include the name. A lab whose real staff list is meant to be shown
passes `{ syntheticOnly: false }` as the third argument.

## Tests

- `npm run test:senaite-personnel`: in-memory transports only, plus a replay of
  the real SENAITE 2.6.0 rejected-token answer from
  `tests/senaite-read/fixtures/recorded`. Also discovered by `npm run test:all`.
- `npm run test:senaite-live`: opt-in acceptance against a running SENAITE
  (see `tests/senaite-live/personnel-read-live.test.ts`). With only
  `SENAITE_LIVE_ORIGIN` it proves a bad token is `unauthenticated` and the
  roster is never requested. With `SENAITE_LIVE_READ_TOKEN` too it reads the
  roster and checks each contact against its own `LabContact/<uid>` object.

Not yet proven: a signed-in read against the real server. That needs the
read-only account from the Codex manual-lane envelope
`CODEX-MANUAL-LIMS-SENAITE-READONLY-ACCOUNT-20261021-R1`. Whether SENAITE's
`complete=yes` LabContact listing carries `review_state` is also unconfirmed.
If it doesn't, `active` reads `null`; it doesn't fail.
