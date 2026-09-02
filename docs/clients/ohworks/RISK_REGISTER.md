# Active risk register

> **Internal only:** this file records local provenance and audit gaps and must be redacted before any customer-facing handoff.

| Risk | Current evidence | Impact | Mitigation / owner |
|---|---|---|---|
| Wrong analyzer or protocol assumed | Instrument name was uncertain; no sample messages available | Invalid adapter and wasted integration work | Keep adapter protocol-neutral; customer IT/lab lead confirms exact contract |
| Legacy material misattributed | Local history suggests DiaSorin/ASTM patterns but attribution is uncertain | Proprietary or irrelevant implementation copied | Use only abstract control patterns; do not reproduce proprietary details |
| Prototype mistaken for validated system | UI can look complete | Unsafe commercial or clinical claim | Persistent synthetic/discovery labels, contract tests, explicit stopped gates |
| Hidden customer-data use | No approved data-flow or privacy agreement exists | Privacy, security, and trust harm | Synthetic fixtures only until G-AUTH and G-PRODWRITE close |
| Capacity inferred from annual range | 30k–40k is a recollected planning estimate | Under/over-designed system | Confirm peaks, batching, concurrency, downtime, and growth before sizing |
| Release coupled to ingestion | Common integration shortcut | Incorrect or unauthorized release | Separate state transition and human authorization control |
| Mapping change causes silent result drift | Exact catalogue and change process unknown | Incorrect structured results | Versioned mappings, golden fixtures, approval, effective dates, rollback |
| Cloud choice made without governance | “Cloud okay” is directional only | Contract, residency, or recovery mismatch | Customer governance decision before G-SPEND/G-PUBLISH |
| Primary Claude project context incomplete | Connected browser profile did not expose that project | Missed requirements or decisions | Export or open primary project and reconcile against this source register |
