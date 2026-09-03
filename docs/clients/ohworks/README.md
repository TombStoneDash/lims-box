# OHWorks supervised demo package

This package is a local, synthetic, discovery-only OHWorks demo inside the
existing LIMS BOX repository. It proves a fail-closed workflow reducer, a
role-filtered view model, a deterministic assistant, and an explicitly
unverified Orchidlive discovery simulator. It does not prove deployment,
customer acceptance, clinical validation, accreditation, or live instrument
compatibility.

## Demonstrated scope

- Route set under `/pilot/ohworks`, including `/pilot/ohworks/bot`.
- Synthetic lifecycle coverage for `Accessioned -> Queued -> Instrument result -> Quarantined -> Technical review -> Released`.
- Role simulator labelled `Demo role simulator - not authentication`.
- Deterministic assistant using approved fictional sources only, with stable
  source IDs and corpus metadata.
- Orchidlive discovery simulator that keeps `LIAISON XL -> Orchidlive -> LIMS BOX`
  framed as a hypothesis rather than a supported fact.
- Local proof stored under `docs/clients/ohworks/proof/`.

## Non-goals

- No production deployment, no live integration, no publication, and no
  external communication.
- No patient, employee-health, or customer records.
- No claim that LIMS BOX, OHWorks, Orchidlive, or any supplier is compliant,
  accredited, certified, validated, deployed, or currently connected.
- No server-auth, billing, analytics, or global navigation changes.

## Package map

- `DEMO_CONTRACT.md`: supervised-demo boundary and truth contract.
- `GARY_QUESTION_ANSWER_MATRIX.md`: likely demo questions and approved answers.
- `SOURCE_REGISTER.md`: confirmed facts, customer-reported inputs, assumptions,
  and discovery-only references.
- `REQUIREMENTS.md`: implementation rules and fail-closed acceptance boundary.
- `ARCHITECTURE.md`: current local architecture and future gated shape.
- `UAT_SCRIPT.md`: desktop and mobile walkthrough.
- `RISK_REGISTER.md`: current risks and mitigations.
- `CHANGE_LOG.md`: append-only implementation history.

## Definition of done for this increment

This slice is complete only when the OHWorks routes, tests, proof artifacts,
local commit, and sanitized receipt all agree on the same synthetic-only
boundary. Any missing proof, failed check, or unsupported live claim means the
increment is not done.
