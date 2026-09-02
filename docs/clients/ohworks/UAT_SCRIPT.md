# Synthetic UAT script

Run locally against `/pilot/ohworks`. Use only the committed synthetic fixtures.

| Step | Action | Expected evidence |
|---|---|---|
| 1 | Open the overview | “Synthetic data” and “Discovery build” are visible; annual range is described as reported planning input |
| 2 | Review the workflow | Ingestion, technical review, and release are separate stages with separate owners |
| 3 | Open Samples | Five `OW-SYN-` records appear with accessioned, queued, result, review, and released examples |
| 4 | Inspect the unmapped sample | It is stopped for review; no mapping is guessed |
| 5 | Open Instrument | Exact analyzer/protocol is shown as unconfirmed; discovery checklist is visible |
| 6 | Review mappings and faults | Replay, malformed input, QC, sample, and mapping exceptions have stop or quarantine behavior |
| 7 | Open Personnel | Every identity is labelled synthetic; training and authorization are distinct |
| 8 | Open Audit | Discovery decisions, synthetic events, and readiness evidence are visible |
| 9 | Attempt to find a production action | No deploy, send, import, or customer-data action exists in the pilot routes |

## Exit criterion

The script passes only as a synthetic product walkthrough. A customer pilot requires a separately approved UAT plan with named users, confirmed interface fixtures, expected outcomes, incident/rollback criteria, and signed acceptance authority.
