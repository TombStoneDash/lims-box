# OHWorks supervised demo contract

## Workflow contract

The local supervised demo must show all six workflow states using synthetic
records only: `Accessioned`, `Queued`, `Instrument result`, `Quarantined`,
`Technical review`, and `Released`.

The transition rules are fail-closed:

1. Queueing is allowed only from `Accessioned`.
2. Ingestion is allowed only from `Queued`.
3. Ingestion creates only `Instrument result` or `Quarantined`.
4. Unknown mappings and malformed payloads are quarantined and never guessed.
5. Technical review is allowed only from `Instrument result` or `Quarantined`.
6. Worker and employer roles cannot review or release.
7. Release is allowed only from `Technical review`.
8. Release requires a distinct authorized technical-review event reference.

## Role and assistant guardrails

1. `filterByDataClass` plus exact tenant matching is the only selection rule
   for role-views and assistant record assembly.
2. Employer and worker views are outcome-only.
3. Reviewer and admin views may also see clinical-detail and admin records.
4. `admitSource` determines whether fictional assistant knowledge is approved.
5. `filterCommercialClaims` is applied immediately before assistant output is
   rendered.
6. Every assistant response keeps `Synthetic demonstration data only` visible.

## Truth boundary

This contract does not authorize or imply live compatibility, deployment,
validation, measured error reduction, certification, accreditation, or
production readiness. The Orchidlive path remains discovery-only.
