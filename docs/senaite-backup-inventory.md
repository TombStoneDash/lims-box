# SENAITE backup/restore inventory

Point 8 of the ten-point OHWorks/SENAITE ask ("prove backup/restore"). The
existing `lib/ohworks-backup-verify` hashes and compares metadata it is handed,
but nothing read that metadata from SENAITE. `lib/senaite-backup-inventory` does.

`createSenaiteInventoryReader().read()` uses the same read-only settings as
`lib/senaite-read` (`SENAITE_BASE_URL` site root over HTTPS, `SENAITE_API_TOKEN`)
and sends only GETs:

1. `users/current` must answer `authenticated: true`. SENAITE 2.6.0 answers a
   rejected token with HTTP 200 as Anonymous and empty folders; without this
   check a bad token would read as a wiped lab.
2. For each portal type a restored OHWorks lab must bring back (`Client`,
   `Contact`, `LabContact`, `SampleType`, `AnalysisCategory`, `AnalysisService`,
   `AnalysisProfile`, `Instrument`, `AnalysisRequest`, `Analysis`), it reads
   every record in pages of 200 using its own `b_start`. Upstream `next` links
   are never followed. Callers may ask for a subset, never another route.
3. Each record must carry its own `portal_type`, a 32-hex `uid` and a valid
   `modified` time. `modified` is compared as an instant, so a restore onto a
   server that writes `+00:00` instead of `+01:00` still matches.

The list is whole or the read fails. Every page must report the same `count`,
each page must be exactly as long as expected, and no record may appear twice.
Records added, removed or reordered mid-read give `inventory-changed`. More than
10,000 records of one type gives `inventory-too-large`. A malformed record, a UID
under two types, an HTTP-200 `success: false` or a server that ignores the page
size gives `invalid-response`. Errors are fixed codes, plus the portal type.

The inventory holds `portalTypes`, `counts` (including types with no records) and
the `buildSenaiteManifest` checksums of `[uid, modified]`. It has no titles, IDs
or field values, so the JSON can be kept as a receipt.

`compareSenaiteInventories(before, after)` fails closed on a malformed or empty
inventory, or one whose counts disagree with its manifest. A type read on only
one side is `missing`. A type read on both sides with no records is a proven
match, which the bare manifest comparison cannot show.

## Receipt commands

```sh
SENAITE_BASE_URL=https://<host>/senaite SENAITE_API_TOKEN=<read-only> \
  npm run -s senaite:backup-inventory > before.json
# back up, restore into a fresh SENAITE, then inventory it the same way to after.json
npm run -s senaite:backup-inventory -- --compare before.json after.json
```

Exit 0 means the inventory was read or the restore matched. 1 means an error or
differences. 2 means not configured. The token is never printed.

## Tests

- `npm run test:senaite-backup`: the stand-in acceptance suite plus the existing
  manifest tests. It covers backup, restore into a new server, and an equal
  inventory. A lost sample, a stale copy and a missing instrument each fail. It
  also replays the recorded real SENAITE 2.6.0 answers.
- `npm run test:senaite-backup-live`: opt-in, through the same SSH tunnel as
  `test:senaite-live`. Skipped without `SENAITE_LIVE_ORIGIN`. With
  `SENAITE_LIVE_READ_TOKEN`, it inventories the server twice and requires them
  to match.

## Not proven yet

- A signed-in inventory of the real server. That needs the read-only account
  from `CODEX-MANUAL-LIMS-SENAITE-READONLY-ACCOUNT-20261021-R1`.
- That senaite.jsonapi 2.6 listings carry `modified` and honour `b_start` on
  every one of these portal types. If one doesn't, the read fails as
  `invalid-response` or `inventory-changed`; it never passes.
- The backup and restore themselves (Data.fs/blobstorage copy into a fresh
  container). This module checks the result; it does not run them.
- Metadata only: an edit that keeps the same `modified` time would not show.
