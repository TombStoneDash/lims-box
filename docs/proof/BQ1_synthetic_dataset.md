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
tests 7
pass 7
fail 0
```

The test suite generates the complete dataset twice with the fixed seed, hashes
every output file, and confirms both generated copies match each other and the
committed fixtures.

Before any recursive replacement, the generator now permits only the canonical
`data/synthetic` directory or a repo-local `.synthetic-data-*` test directory.
Existing temporary targets must carry the generator-owned sentinel, and symlink
components, repository-root aliases, outside paths, and unowned directories fail
closed. Sentinel-preservation tests prove rejection happens before deletion.

The privacy control uses this documented synthetic identity allowlist:

- sample IDs: `SYN-26DDD-NNNN`;
- customer IDs: `SYN-CUST-NNN`;
- result IDs: `SYN-RES-NNNNN`;
- personnel IDs/names: `SYN-STAFF-NNN` / `Synthetic Staff NN`;
- authorization IDs: `SYN-AUTH-NNN`;
- HL7 subject/message IDs: `SYNTHETIC-SUBJECT-NNN` / `SYN-MSG-NNN`.

ISO timestamps, assay names, analytes, units, and explicit `SYNTHETIC_*`
facility/analyzer labels are allowed because they are generated domain fixtures,
not identity-bearing input. No real-corpus input path exists: the generator imports
only Node built-ins and its checked-in fabricated blueprints.

It also verifies:

- all 200 IDs and fake customer IDs use the synthetic namespace;
- 120 of 200 samples are in progress without copying a source-corpus percentage;
- every ordered test is valid for the sample matrix;
- every catalog entry declares a matrix-specific container, unit, analyte, and detection limit;
- every result has a recognized flag, unit, detection limit, and valid sample/test link;
- all five HL7 fixtures are ORU_R01 messages and contain an explicit fabricated-data note;
- every identity-bearing JSON and HL7 field matches the allowlist;
- every generated artifact is scanned for email, SSN, phone, street-address,
  medical-identity labels, private keys, bearer/JWT tokens, quoted or unquoted
  JSON/YAML credential assignments, and high-confidence provider-token shapes;
- adversarial fixtures for every prohibited category are detected by the same
  scanner without returning secret values, while safe synthetic/non-credential
  lookalikes remain allowed.

No production table, client corpus, credential, external service, deployment,
or database was read or written to produce this dataset.
