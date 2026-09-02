# OHWorks controlled client pilot

This package is a local, synthetic, discovery-stage client workspace for OHWorks. It demonstrates a bounded specimen lifecycle, a protocol-neutral analyzer workbench, personnel authorization, and an audit/evidence view. It is not a deployed customer system and contains no customer records.

## Demonstrated scope

- Synthetic accession-to-release workflow with explicit human review.
- Analyzer mapping and exception controls without claiming a confirmed interface.
- Personnel competence and authorization evidence using invented identities.
- Audit events, discovery decisions, and a readiness matrix.
- Local route: `/pilot/ohworks`.

## Non-goals

- No production deployment, DNS, paid infrastructure, or customer access.
- No patient, employee, specimen, or other customer data.
- No claim of accreditation, regulatory compliance, validation, or clinical fitness.
- No assumption that a DiaSorin analyzer, ASTM transport, or any exact model is confirmed.
- No email, outreach, or customer-facing publication.

## Package map

- `SOURCE_REGISTER.md`: provenance and confidence.
- `REQUIREMENTS.md`: known requirements and discovery gates.
- `ARCHITECTURE.md`: bounded target design and trust boundaries.
- `DATA_DICTIONARY.md`: pilot entities and synthetic fields.
- `SECURITY_AND_PRIVACY.md`: controls required before real data.
- `UAT_SCRIPT.md`: synthetic acceptance walkthrough.
- `DEPLOY_CHECKLIST.md`: stopped gates for any later deployment.
- `RISK_REGISTER.md`: active risks and mitigations.
- `ROLLBACK.md`: local rollback and recovery.

## Definition of done for this increment

The routes render from a clean build, the contract tests enforce synthetic and discovery labels, the repository lint/type/build checks pass or any pre-existing failure is separately evidenced, and an independent reviewer records a verdict. Customer discovery remains a legitimate next phase rather than hidden unfinished implementation.
