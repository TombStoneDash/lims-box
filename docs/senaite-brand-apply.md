# SENAITE brand apply

Point 7 of the ten-point OHWorks/SENAITE ask: apply the `brand.yml` branding.
`lib/ohworks-brand` validates an already-parsed brand. `lib/senaite-brand-apply`
writes the parts SENAITE holds to SENAITE's own Laboratory record and reports
each one only after SENAITE reads it back. No route, page, job or script calls
it yet.

```ts
const applier = createSenaiteBrandApplier();
const plan = await applier.applyBrand(parsedBrandYml);               // reads only
const done = await applier.applyBrand(parsedBrandYml, { apply: true });
```

## Configuration

It needs `SENAITE_BASE_URL` (the site root, as in [senaite-read.md](./senaite-read.md))
and its own write credential, `SENAITE_BRAND_TOKEN`, for an account that may
edit the laboratory. The read-only `SENAITE_API_TOKEN` never enables it. The
same rules apply as for the other adapters: HTTPS only, no embedded
credentials, query or fragment, no redirects, 10 s timeout, no retries.
Configuration that is missing or invalid sends no request.

## What gets applied

| brand.yml      | SENAITE                              |
| -------------- | ------------------------------------ |
| `labName`      | Laboratory `Name`                    |
| `supportEmail` | Laboratory `EmailAddress`            |
| `legalName`, `primaryColor`, `accentColor`, `logoPath`, `reportFooter` | not applied; listed in `notInSenaite` |

The Laboratory record has no field for the other five. Colors and the logo
live in Plone's registry, and the report footer lives in the report templates.
Neither is reachable through senaite.jsonapi, so the outcome lists them instead
of claiming them.

## What one run does

1. The brand is validated with `parseOHWorksBrand`. An invalid brand fails as
   `invalid-brand` before any request. Its `issues` name fields and codes,
   never values.
2. `GET users/current` must answer `authenticated: true`. SENAITE 2.6 answers a
   rejected token with HTTP 200 as Anonymous.
3. `GET Laboratory?complete=yes` must return exactly one record, and every
   record must be `portal_type: Laboratory`. senaite.jsonapi drops query keys
   that aren't catalog indexes, so a foreign record fails as `scope-mismatch`.
4. Each mapped field is compared. If nothing differs the result is `UNCHANGED`.
   Without `apply: true` the result is `PLANNED` and nothing is written.
5. With `apply: true`, one `POST update` sends `uid` and only the fields that
   differ. Then `GET Laboratory?UID=…` reads the record back. Every mapped field
   must equal the brand, or the result is `write-unconfirmed`.

A lost update answer is `write-unconfirmed`. Re-running is safe. It reads the
record and reports `UNCHANGED` if the write landed, so nothing is written twice.

## Errors

`SenaiteBrandError.code` is one of `invalid-brand`, `not-configured`,
`unauthenticated`, `request-failed`, `invalid-response`, `scope-mismatch`,
`write-failed` (HTTP error or `success: false`) and `write-unconfirmed`.
Messages carry the code only, never upstream bodies, URLs, tokens or brand values.

## Not proven yet

There has been no signed-in run against a real SENAITE yet. That needs a
synthetic-data server and a brand token. It also assumes that senaite.jsonapi
2.6 lists the Laboratory under its portal type and accepts `Name` and
`EmailAddress` through `update`. If either assumption is wrong, the run fails as
`invalid-response` or `write-unconfirmed`. It does not report success.

Tests: `npm run test:senaite-brand-apply`.
