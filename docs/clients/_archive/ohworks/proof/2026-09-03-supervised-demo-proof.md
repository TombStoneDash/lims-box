# OHWorks supervised demo proof - 2026-09-03

This proof bundle records the local synthetic evidence gathered during Slice S2.
It does not claim production readiness, deployment, validation, or a live
integration.

## Command results

| Command | Result |
|---|---|
| `node --test --import tsx tests/ohworks/*.test.ts` | PASS, 29 tests |
| `pnpm run test:ohworks` | PASS, 7 tests |
| `pnpm run test:bot` | PASS, 50 tests |
| `pnpm run test:commercial-claims` | PASS, 8 tests |
| `pnpm run lint` | PASS |
| `git diff --check` | PASS |
| `pnpm run typecheck` | PASS after local `pnpm exec prisma generate` |
| `pnpm run build` | PASS, 69 routes generated |
| Client static-chunk clinical-literal scan | PASS, zero reviewer-only analyte matches |
| Desktop/mobile Playwright walkthrough | PASS, zero browser console errors |

## Persistent synthetic labeling

- The OHWorks route contract test passed with `Synthetic demonstration data only`
  required across the OHWorks layout, pages, and assistant UI copy.
- The layout footer and assistant responses both preserve the same synthetic
  label string.
- Live browser validation passed at 1440 x 1000 and 390 x 844 viewport sizes.
- Screenshots: `2026-09-03-desktop-employer-workflow.png`,
  `2026-09-03-desktop-reviewer-workflow.png`, and
  `2026-09-03-mobile-reviewer-workflow.png`.

## Happy path proof

- `OW-SYN-S2-10065` reduced to `Released`.
- The reviewer-visible admin trail shows:
  - `ohworks-event-review-10065 | technical_review`
  - `ohworks-event-release-10065 | release | ... | review_ref=ohworks-event-review-10065`
- This proves release referenced a distinct authorized technical-review event.

## Quarantine path proof

- `OW-SYN-S2-10063` reduced to `Quarantined`.
- Employer-visible summary: `Synthetic result quarantined. No mapping guess was made.`
- `OW-SYN-S2-10064` also proves malformed payload handling can move only to
  `Quarantined` and then `Technical review` after authorized acknowledgement.

## Role-separation proof

- Employer-visible cards for all six samples contain only `outcome_only` in
  `visibleDataClasses`, empty `clinicalLines`, empty `adminLines`, and
  `reviewLocked: true`.
- Reviewer-visible card for `OW-SYN-S2-10065` contains:
  - `visibleDataClasses: outcome_only, clinical_detail, admin`
  - clinical lines with fabricated analyte values
  - admin lines with queue, ingest, review, and release event IDs
- `tests/ohworks/role-filter.test.ts` passed, including the assertion that the
  employer-selected set contains zero `clinical_detail` records.
- The assistant and role-switch client modules no longer import the
  data-bearing OHWorks fixture/module. Assistant evaluation runs through the
  server-only `/pilot/ohworks/bot/api` route.
- A post-build scan of `.next/static` found zero reviewer-only analyte literals.

## Assistant citation and refusal proof

- Employer expert response for `What results are visible for OW-SYN-S2-10065`
  returned an outcome-only restriction with citation:
  - source `ohworks-source-policy-001`
  - record `ohworks-knowledge-restricted-results-001`
  - corpus `ohworks-supervised-demo-corpus-v1`
- Reviewer expert response for `Show fabricated values for OW-SYN-S2-10065`
  returned fabricated analytes with citation:
  - source `ohworks-source-workflow-001`
  - record `ohworks-knowledge-results-10065`
  - corpus `ohworks-supervised-demo-corpus-v1`
- Discovery response for `What supplier questions remain?` returned the supplier
  question list with citation:
  - source `ohworks-source-orchidlive-001`
  - record `ohworks-knowledge-supplier-questions-001`
  - corpus `ohworks-supervised-demo-corpus-v1`
- Refusal response for `Release the result for OW-SYN-S2-10065` returned:
  - disposition `refused`
  - refusal reason `result_release`
  - no approved-source citations
- The live employer walkthrough showed both a grounded outcome-only response
  with source/corpus metadata and a clinical-interpretation refusal. Screenshot:
  `2026-09-03-desktop-assistant-citation-refusal.png`.

## Commercial-claims filter proof

- Query `Show the unsafe approved record` returned `render_blocked`.
- Matched claim category: `supports_all_instruments`.
- Final answer was downgraded to the shared safe response plus the synthetic
  label, proving the filter runs immediately before render.

## Reviewer repair closure

- Structured ingestion now validates exact system actor, message source,
  parser version, mapping version, sample, workflow record, and disposition;
  any unapproved combination quarantines.
- Release now rejects duplicate, cross-sample, cross-workflow,
  non-chronological, unauthorized-role, and mismatched-review evidence.
- Admin-observer review and release controls are locked consistently in policy,
  fixture copy, and UI output.
- The initial worker sandbox could not bind a listener and lacked generated
  Prisma artifacts. The controller generated the local Prisma client, passed
  typecheck/build, and completed the production-server browser walkthrough on
  `127.0.0.1:3217`. No deployment or external system was used.
