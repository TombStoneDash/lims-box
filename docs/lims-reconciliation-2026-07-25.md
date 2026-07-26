# LIMS reconciliation pass — issue #72 receipt (2026-07-25)

One bounded commander pass over `lims-box`, `limsbot`, `lims-bot-demo`,
the Vercel account state, and prior output packets. Everything below is
verified against live sources this date — repo heads, GitHub issue/PR
state, Vercel project/deployment metadata (read-only), and production
HTTP checks. No deploy, no production data change, no outreach.

## Verified current state

- `lims-box@main` = `5502975` (telemetry #71 merged). Six test suites,
  typecheck, and `next build` all green on a fresh clone this date.
- `lims.bot` production serves `main`; both Vercel projects
  (`lims-box` canonical, legacy `limsbot`) still build **this repo, same
  commit, twice per push** — reconfirmed on the 2026-07-21 push
  (builds 103 ms apart). Code-safe fix shipped this date as PR #73.
- `limsbot@main` = `6e757d6`; PR #5 (onboarding card) verified at exact
  head `0e08fd7`: 31/31 tests, lint 0 errors, typecheck clean, build
  green. Receipt on the PR.
- **No Vercel project builds the `limsbot` GitHub repo.** The Vercel
  project named `limsbot` builds the `lims-box` repo. The `limsbot`
  GitHub repo is an un-deployed second marketing/demo site (blog,
  `/lims-bot` demo, `/field-scout`, `/lab-operations-logs/*`,
  `/roadmap/*`) whose `vercel.json` already 308s every non-`lims.bot`
  host — it was authored as a redirect-safe surface but was never bound.
- `lims-bot-demo@master` (pushed 2026-07-11): local Docker
  SENAITE + LIMS BOT natural-language demo. Not deployed; no issues.
- All five legacy domains serve duplicate 200 content with
  `canonical=https://lims.bot` (fix = PR #73 + gated dashboard steps).

## Classification

| Output | Class |
|---|---|
| lims-box issues #61, #64, #66, #68 (merged via PRs #63/#65/#67/#69/#71; live on prod) | **DONE** |
| May-2026 physical demo packets (COLA package, YC video, UPS print handoff, logo/QR manifests in `~/Documents/outbox`) | **DONE** (historical; do not rebuild) |
| limsbot PR #5 (onboarding card) | **ACTIVE** — merge-ready, receipt posted 2026-07-25 |
| Issue #70 code-safe portion | **DONE this pass** — PR #73 (host 308s + names-only comparison + reversible sequence) |
| Issue #70 dashboard portion (env/protection/integration names diff, domain move, disable legacy Git builds) | **TRUE_GATE** — Vercel dashboard, ordered sequence in `docs/vercel-duplicate-reconciliation-2026-07-25.md` |
| Legacy Vercel `limsbot` project as a build surface | **DUPLICATE** — every push builds twice; retire builds via the gated sequence, preserve project as rollback |
| `limsbot` GitHub repo as a *second deployed site* | **HOLD** — un-deployed duplicate marketing surface. Do **not** bind a third Vercel project. Keep as demo/staging sandbox; merging PR #5 is repo hygiene with zero production effect. Folding its unique routes (`/field-scout`, `/lab-operations-logs`) into `lims-box` is the eventual non-duplicate path. |
| `lims-bot-demo` (SENAITE Docker demo) | **ACTIVE** — the only artifact with a real SENAITE write path; feeds both lanes below |
| `voice/` module in lims-box | **HOLD** — no lane dependency, no cost; ignore |
| Any new roadmap/architecture document | **KILL** — #72 explicitly forbids another general roadmap |

## Clinical-lab revenue lane

**COLA/CLIA inspection-prep → early-adopter funnel on `lims.bot`.**
This is the instrumented lane: personnel-pack + CLIA-tracker content
(DONE), early-adopter form with UTM attribution preserved end-to-end
(#69), privacy-safe aggregate telemetry (#71), compliant unsubscribe
(#67), commercial claims swept (#64). The SENAITE demo (`lims-bot-demo`)
is the proof asset for "type plain English, get a real LIMS record."
Revenue motion: inspection-prep content → early-adopter signup →
demo call. Everything up to the send is machine-safe; the send is gated.

## Water/public-utility revenue lane

**Field sampling → SENAITE for small water/wastewater/environmental
labs.** Evidence: `/field-scout` + offline-field-mode surfaces (limsbot
repo), the `senaite/` client in this repo, and SENAITE's real market
footprint in water/environmental labs. This lane has demo surfaces but
no instrumented funnel yet — it is one bounded packet (P4), not a
program.

## Packets (≤5)

| # | Packet | State |
|---|---|---|
| P1 | Reverify limsbot PR #5 at exact head; receipts | **COMPLETED this pass** (receipt on PR #5) |
| P2 | Issue #70 code-safe delta: app-layer host 308s + reconciliation doc | **COMPLETED this pass** (PR #73) |
| P3 | Issue #70 dashboard completion (names-only env/protection/integration diff → domain move → disable legacy builds → single-build verification) | **TRUE_GATE** — human at dashboard, sequence documented |
| P4 | Water-lane funnel parity: port `/field-scout` entry + an early-adopter form variant with the existing UTM/telemetry plumbing into `lims-box` (kills the strongest reason to deploy the duplicate limsbot site) | **BUILD_NOW** — machine-safe, next code session |
| P5 | Clinical-lane conversion proof: names-only aggregate report over telemetry + attribution tables (counts by source/campaign, no PII) as an admin-gated route or script | **BUILD_NOW** — machine-safe against preview data; prod read is a named read-only check |

## True gates (unchanged by this pass)

Protected LIMS outbound send; payment/contract; production DB mutation;
DNS/registrar or domain transfer; secret mutation; project deletion;
merging PRs (#5, #73) is Hudson's call; P3 dashboard sequence.

## Proof

- PR #5 receipt: gates table at head `0e08fd7` (comment, 2026-07-25).
- PR #73: branch `fix/issue-70-legacy-host-redirects` @ `3c4663e`,
  new test 2/2, suites 48/48, typecheck clean, build exit 0.
- Vercel duplication: deployment IDs/timestamps in
  `docs/vercel-duplicate-reconciliation-2026-07-25.md`.
- Domain behavior: live HTTP checks 2026-07-25 (200s + canonical tags;
  `next.config.js` redirects proven live, `vercel.json` rule proven dead).

## Next automatic actions

1. On merge of PR #73: run the P3 dashboard sequence (gated).
2. On merge of PR #5: none — no production surface; repo hygiene only.
3. Next code session: P4, then P5.
