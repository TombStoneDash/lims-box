# Deployment checklist: intentionally stopped

No item in this document is authorization to deploy.

## Discovery and acceptance

- [ ] Clinical intended use and quality scope approved.
- [ ] Exact analyzer and interface contract confirmed with representative redacted or synthetic messages.
- [ ] Test menu, mappings, units, flags, amendments, and exception behavior approved.
- [ ] Named pilot workflow, users, acceptance owner, success measures, and exit criteria approved.

## Security and operations

- [ ] Data protection, hosting region, retention, backup, restore, and incident decisions approved.
- [ ] Identity, MFA, roles, access review, support access, and tenant isolation verified.
- [ ] Threat model, dependency/security checks, audit integrity, monitoring, alerting, and recovery test complete.
- [ ] Change owner, maintenance window, rollout, rollback, and support coverage named.

## Gates requiring fresh authority

- `G-AUTH`: provision customer identities or change permissions.
- `G-PRODWRITE`: import or mutate customer/production data.
- `G-SEND`: send email or external outreach; LIMS Box email remains prohibited by worker policy.
- `G-PUBLISH`: expose a public or customer-facing environment.
- `G-SPEND`: purchase infrastructure, services, certificates, or subscriptions.
- `G-DNSBILL`: change DNS, domains, billing, or paid hosting.

The current increment closes none of these gates.
