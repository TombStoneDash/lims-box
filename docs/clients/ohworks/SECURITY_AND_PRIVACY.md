# Security and privacy boundary

## Present state

- Local source code and synthetic fixtures only.
- No customer login, secrets, API calls, database writes, analytics, email, or external integrations.
- No patient, employee, specimen, or instrument-message data from OHWorks.

## Controls required before real data

1. Written purpose and data-flow definition, including controller/processor responsibilities.
2. Approved hosting region, encryption, key management, data minimization, retention, deletion, backup, and restore plan.
3. Federated identity or approved account lifecycle, MFA, least privilege, session controls, and privileged-access review.
4. Server-side authorization for every tenant, site, laboratory, role, record, and release action.
5. Immutable security and clinical audit evidence with monitored integrity and access.
6. Threat model covering tenant isolation, instrument input, replay, mapping manipulation, support access, export, and incident response.
7. Dependency, secret, SAST, and deployment scanning in an approved pipeline.
8. Customer-approved verification, incident, vulnerability, and business-continuity procedures.

## Prohibited shortcut

Synthetic success must not be used as evidence that the system is accredited, clinically validated, production secure, or approved for customer data.
