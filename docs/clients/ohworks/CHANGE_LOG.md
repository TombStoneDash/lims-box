# OHWorks LIMS BOT change log

Model-run and implementation changes for the LIMS BOT product line, in the
convention required by `LIMS_BOT_EXPERT_V2_SPEC_20260902.md` section 7.2:
every entry records the request, assessment, exact tests, approval state,
release note, and rollback note. Entries are append-only.

## 2026-09-03 — Slice S1: schemas and deterministic scaffolding

**Request:** Implement Slice S1 of the LIMS BOT v2 spec (section 16.1) — the
smallest useful, non-production foundation: a rights-aware source registry
and admission validator, the `data_class`/`PrincipalContext` policy
contract, a model-run receipt recorder, deterministic intent/router
fixtures, and a reusable forbidden-claims output filter. Authorized under
`HT-LIMS-OHWORKS-ASAP-INTERNAL-EXECUTION-20260902`.

**Assessment:** Local code and tests only. No model call, no retrieval, no
ingestion, no UI or route change, no SENAITE or network access, no auth
change, no deployment, no publish, no email, no customer data. The existing
deterministic `/bot` remains the active, unmodified fail-closed behavior;
`lib/bot/engine.ts` was not changed.

**Exact tests:**

- `tests/bot/source-registry.test.ts`
- `tests/bot/data-class.test.ts`
- `tests/bot/model-receipt.test.ts`
- `tests/bot/intent-fixtures.test.ts`
- `tests/bot/output-claims-filter.test.ts`
- `tests/content/commercial-claims.test.ts` (modified to import the
  canonical `lib/bot/commercial-claims.ts` module)

**Approval state:** Documentation and independent-review gates passed
(`LIMS_BOT_V2_INDEPENDENT_REVIEW_20260902_R2.md`, verdict `PASS`). This
implementation attempt proves only a local, deterministic foundation — it
does not prove a live model connection, RAG quality, tenant deployment, or
production readiness (spec sections 14 and 18 govern later gates).

**Release note:** Adds five new `lib/bot` modules, five new fixture files,
and five new test files, all schema/policy/fixture only. No existing route,
page, or production behavior changes.

**Rollback:** `git revert` the commit that introduced this entry. No other
system state changes as a result of this slice.
