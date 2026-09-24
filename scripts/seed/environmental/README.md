# Environmental lab demo seed (SYNTHETIC)

Seed data and scripts for a generic multi-lab LIMS BOX demo, environmental lab first.
It targets SENAITE, the system of record, through its JSON API.

**Everything in this folder is synthetic.** Client names, contacts, sample points,
sample IDs, timestamps, and QC values are invented. Client names end in `(SYNTHETIC)`.
No customer data, no PHI, and nothing OHWorks-specific.

## What is in it

- `data.mjs`: the seed.
  - 4 sample types: drinking water, wastewater, surface water, soil.
  - Bottle groups with container and preservation.
  - 9 methods: EPA 200.8, SW-846 6020, EPA 300.0, SM 5210B (BOD), SM 2540D (TSS),
    SM 5220D (COD), EPA 524.2, SW-846 8260, SM 9223B (Colilert).
  - 20 analyses with units, reporting limits, holding times, and example regulatory limits.
  - 4 synthetic clients, 30 synthetic samples, 9 QC batches (method blank, LCS, MS/MSD).
- `validate.mjs`: pure validator. No network, no writes.
- `load.mjs`: SENAITE JSON API loader. **Dry run is the default.**
- `seed.test.mjs`: unit tests.

## The two seeded problems

The demo has exactly one of each, flagged in the data and checked by the validator:

1. **Holding-time breach:** sample `SYN-ENV-WW-0003`, BOD5 set up 55 h after collection.
   The limit is 48 h. Flag: `HOLDING_TIME_BREACH`.
2. **QC failure:** batch `SYN-QC-01` (EPA 200.8), lead LCS recovery 121%.
   The example limit is 85 to 115%. Flag: `QC_FAILURE`.

The validator recomputes both from timestamps and QC values. It fails if a flag does
not match the math, or if there is not exactly one of each.

## How to run (safe, local, no network)

```sh
node scripts/seed/environmental/validate.mjs          # prints summary, exit 0 if valid
node scripts/seed/environmental/load.mjs              # DRY RUN: prints planned create calls
node --test scripts/seed/environmental/seed.test.mjs  # unit tests
```

No `npm install` is needed. Node 22 or later.

## --apply is gated

Do **not** run `load.mjs --apply` until both are true:

1. **Hudson has given GO for the demo droplet** (a snapshot copy, not OHWorks).
2. **The target SENAITE is patched** for advisory `GHSA-jrw6-7x4q-w25j` / `CVE-2026-54569`,
   an unauthenticated JSON-API remote code execution bug that affects SENAITE 2.6.0.
   See the "2026-09-03 security containment" note in
   `Hermes/projects/lims-box/LIMS_CURRENT_TRUTH.md` and
   https://github.com/advisories/GHSA-jrw6-7x4q-w25j

The loader enforces part of this. `--apply` refuses to run unless these env vars are set:

```sh
SENAITE_URL=http://127.0.0.1:8081   # base URL of the demo instance
SENAITE_USER=...                    # never commit credentials
SENAITE_PASS=...
SENAITE_SITE=senaite                # optional, default senaite
SENAITE_PATCHED_ACK=GHSA-jrw6-7x4q-w25j
```

Setting `SENAITE_PATCHED_ACK` is a human statement that the instance is patched.
The script cannot check it.

## What --apply creates

In order: analysis categories, methods, sample types, analysis services, clients,
contacts, then samples (AnalysisRequest) with their analyses.

It does **not** enter results or QC values. Those stay in `data.mjs` for the validator
and for a later results step.

Setup objects and clients are looked up by title first and reused. Contacts and
samples are always created. **Run it once on a fresh snapshot.**

## Holding-time sources

Primary source: **40 CFR 136.3 Table II**. Each analysis has a `holdingTime.status`:

- `CITED`: taken from the named table. Still check the current eCFR text before a real lab uses it.
- `UNVERIFIED`: believed correct, not checked against the source during this build.

Current values:

- Metals (200.8): 6 months, treated as 180 days. CITED, Table II.
- Metals (6020, soil): 180 days. UNVERIFIED, SW-846 Chapter Three.
- Chloride, sulfate, fluoride (300.0): 28 days. CITED, Table II.
- Nitrate as N (300.0, unpreserved): 48 h. CITED, Table II.
- BOD (5210B): 48 h. CITED, Table II.
- TSS (2540D): 7 days. CITED, Table II.
- COD (5220D, H2SO4): 28 days. CITED, Table II.
- VOCs in drinking water (524.2): 14 days. UNVERIFIED, method text.
- Benzene in wastewater (8260, HCl): 14 days. CITED, Table II.
- Benzene in soil (8260 via 5035, methanol): 14 days. UNVERIFIED, SW-846 Chapter Four.
- Coliform in drinking water (9223B P/A): 30 h. UNVERIFIED, 40 CFR 141 Subpart Y section not checked.
- E. coli MPN in surface water and wastewater (9223B): 8 h. CITED, Table II.
  The extra 2 h processing allowance in the Table II footnote is not modeled. UNVERIFIED.

## Limits are examples

- **Regulatory limits** are all labeled `basis: 'example'`, with a citation hint
  (for example 40 CFR 141.62). Soil screening levels are not sourced at all.
  None of these is a compliance limit for any real permit or water system.
- **QC acceptance limits** are example values. A real lab uses its own SOP limits.
  The BOD check standard range (198 +/- 30.5 mg/L) and the 200.8 LCS range (85 to 115%)
  are believed to match the methods but are UNVERIFIED.

## Known unknowns

These SENAITE 2.x JSON API details are copied from the existing `lims-bot-demo`
seed script or are assumptions. Confirm them on the patched demo instance with a
dry run review first:

- Parent paths `/senaite/setup/sampletypes`, `/senaite/setup/analysiscategories`,
  `/senaite/bika_setup/bika_analysisservices`, `/senaite/clients` (from lims-bot-demo).
- `/senaite/methods` parent path and the `Method` portal type (UNVERIFIED).
- `POST analysisrequest` for samples and the `ClientSampleID` field (UNVERIFIED).
- Analysis services are not linked to their Method object; the method is named in the description.
- Timestamps are UTC. No daylight saving handling is needed.
