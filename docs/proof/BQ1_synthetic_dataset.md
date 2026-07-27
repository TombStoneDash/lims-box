# BQ1 Synthetic LIMS Dataset Proof

**Generated:** 2026-07-26

**Seed:** `20260726`

**Classification:** fabricated demo and test data only

## Output

| Dataset | Count | Required shape |
|---|---:|---|
| Samples | 200 | Serum, plasma, swab, and urine; Julian-style synthetic IDs; fake customer IDs |
| Test catalog | 30 | Serology, molecular, chemistry, TB, and environmental disciplines; matrix validity and containers per test |
| Results | 344 | Flags, units, detection limits, and sample/test links |
| Personnel | 12 | Synthetic display names, competencies, and authorizations |
| ORU_R01 messages | 5 | Explicitly synthetic patient, facility, analyzer, and note values |

Sample record:

```json
{
  "id": "SYN-26041-0001",
  "customer_id": "SYN-CUST-001",
  "matrix": "serum",
  "container": "SST",
  "status": "in_progress",
  "test_codes": ["CHEM-ALT", "CHEM-AST", "SER-AB-HBV"],
  "synthetic": true
}
```

Catalog record:

```json
{
  "code": "SER-AB-HAV",
  "discipline": "serology",
  "valid_matrices": ["serum"],
  "containers_per_test": [{"matrix": "serum", "type": "SST", "quantity": 1}],
  "units": "IU/mL",
  "detection_limit": 0.2,
  "synthetic": true
}
```

## Determinism and privacy proof

Command:

```text
npm run test:synthetic
```

Result:

```text
tests 4
pass 4
fail 0
```

The test suite generates the complete dataset twice with the fixed seed, hashes
every output file, and confirms both generated copies match each other and the
committed fixtures.

It also verifies:

- all 200 IDs and fake customer IDs use the synthetic namespace;
- 120 of 200 samples are in progress without copying a source-corpus percentage;
- every ordered test is valid for the sample matrix;
- every catalog entry declares a matrix-specific container, unit, analyte, and detection limit;
- every result has a recognized flag, unit, detection limit, and valid sample/test link;
- all five HL7 fixtures are ORU_R01 messages and contain an explicit fabricated-data note;
- known real-corpus operational figures `1684`, `449`, `589`, `646`, `945`, and `1197` have zero whole-number matches in generated output.

Independent denylist command result:

```text
DENYLIST_MATCHES=0
```

No production table, client corpus, credential, external service, deployment,
or database was read or written to produce this dataset.
