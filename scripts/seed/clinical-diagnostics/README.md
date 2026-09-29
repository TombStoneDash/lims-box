# Clinical and diagnostics lab demo seed (SYNTHETIC)

Seed data for two made-up labs in the multi-lab LIMS BOX demo, next to the environmental seed in `../environmental/`. It targets SENAITE through its JSON API, the same way.

**Everything here is synthetic.** Lab and client names end in `(SYNTHETIC)`. There are no patient names, birth dates, addresses or record numbers. Each sample has only a synthetic sample ID (`SYN-...`) and a synthetic subject code (`SYN-SUBJ-...`). The validator rejects any sample that carries a patient field.

## What is in it

- `data.mjs`: the seed.
  - **ABC Clinical (SYNTHETIC):** serum, EDTA whole blood and urine. Glucose, potassium, creatinine, HbA1c, WBC and urine protein.
  - **ABC Diagnostics (SYNTHETIC):** nasopharyngeal swab, throat swab and urine culture. SARS-CoV-2 RT-PCR, Group A Strep PCR and urine culture.
  - 4 synthetic clients, 27 samples, 5 QC batches.
- `validate.mjs`: pure validator. No network, no writes.
- `load.mjs`: SENAITE loader. **Dry run is the default.** `--apply` reuses the environmental loader's gate and API code.
- `seed.test.mjs`: unit tests. CI runs them through `tests/seed/clinical-diagnostics.test.ts`.

## The seeded problems (exactly one of each per lab)

The validator recomputes each one from timestamps and QC values. It fails if a flag does not match the math, or if a lab does not have exactly one of each.

| Lab | Holding-time breach | QC failure |
|---|---|---|
| ABC Clinical | `SYN-CLN-SER-0004` potassium tested 7 h after collection; example limit 4 h (an unspun tube can falsely raise K) | `SYN-QC-CLN-01` glucose Level 2 control at 268 vs 250 +/- 5 mg/dL (3.6 SD, Westgard 1-3s) |
| ABC Diagnostics | `SYN-DX-UC-0003` urine culture plated 30 h after collection; example limit 24 h | `SYN-QC-DX-01` SARS-CoV-2 negative control read Detected (possible contamination) |

## Limits are examples

Stability times, reference intervals and control targets are illustrative values for a demo, labelled `basis: 'example'` and `UNVERIFIED`. They are not clinical guidance. A real lab uses its own validated limits and its manufacturers' instructions.

## How to run (safe, local, no network)

```sh
node scripts/seed/clinical-diagnostics/validate.mjs          # summary, exit 0 if valid
node scripts/seed/clinical-diagnostics/load.mjs              # DRY RUN: 55 planned create calls
node --test scripts/seed/clinical-diagnostics/seed.test.mjs  # unit tests
```

## --apply is gated

Same gate as `../environmental/README.md`: only on the approved, patched demo copy, with `SENAITE_URL`, `SENAITE_USER`, `SENAITE_PASS` and `SENAITE_PATCHED_ACK=GHSA-jrw6-7x4q-w25j` set in the shell. Run it once, on a fresh copy. The loader creates setup, clients, contacts and samples. It does not enter results. Result values are in `data.mjs` for the validator and for a later results step, like `../environmental/results.mjs`.

The SENAITE JSON API paths are the ones the environmental loader uses; the same items are UNVERIFIED on this build (see that README's "Known unknowns").
