# OHWorks supervised demo change log

Entries are append-only and describe only local synthetic implementation work.

## 2026-09-03 - Slice S2 independent-review repair

**Assessment:** Closed all four independent review findings. Ingestion now
derives acceptance from approved actor/source/parser/mapping/sample evidence;
release validates same-workflow reviewer provenance and chronology; admin is
read-only; and assistant evaluation moved behind a server-only route so
reviewer-only clinical fixtures do not ship in client static chunks.

**Verification:** 29/29 OHWorks tests, 7/7 contract tests, 50/50 bot tests,
8/8 commercial-claims tests, typecheck, lint, clean diff, production build,
client-chunk leakage scan, and desktop/mobile browser walkthrough all passed.
Four screenshots record the live local proof. Browser console errors: zero.

**Boundary:** Local synthetic demo only. No deployment, customer data,
production connection, publication, email, or external outreach.

## 2026-09-03 - Slice S2 supervised OHWorks demo

**Request:** Complete the independently reviewed local synthetic OHWorks
supervised demo after the prior provider stream aborted before edits.

**Assessment:** Local code, tests, proof, and commit only. No deployment, no
publication, no customer data, no external action, and no live integration.

**Exact checks required by packet:**

- `node --test --import tsx tests/ohworks/*.test.ts`
- `pnpm run test:ohworks`
- `pnpm run test:bot`
- `pnpm run test:commercial-claims`
- `pnpm run typecheck`
- `pnpm run lint`
- `git diff --check`
- `pnpm run build` only if safe for local-only execution

**Release note:** Added a fail-closed workflow reducer, role-filtered OHWorks
views, the `/pilot/ohworks/bot` deterministic assistant, an Orchidlive
discovery simulator, new supervised-demo fixture data, expanded OHWorks tests,
and updated documentation plus proof artifacts.

**Rollback:** Revert the single local commit produced by this task. No external
state, production data, or remote configuration was changed.

## 2026-09-03 - Slice S1 reference

S1 supplied the reusable local policy modules for source admission,
data-class filtering, model receipts, deterministic fixtures, and the
commercial-claims filter that this S2 OHWorks demo imports and reuses.
