# OHWorks supervised demo proof - 2026-09-03

This proof bundle records the local synthetic evidence gathered during Slice S2.
It does not claim production readiness, deployment, validation, or a live
integration.

## Command results

| Command | Result |
|---|---|
| `node --test --import tsx tests/ohworks/*.test.ts` | PASS, 26 tests |
| `pnpm run test:ohworks` | PASS, 6 tests |
| `pnpm run test:bot` | PASS, 50 tests |
| `pnpm run test:commercial-claims` | PASS, 8 tests |
| `pnpm run lint` | PASS |
| `git diff --check` | PASS |
| `pnpm run typecheck` | FAIL outside OHWorks allowlist |
| `pnpm run build` | FAIL outside OHWorks allowlist during unrelated page-data collection |

## Persistent synthetic labeling

- The OHWorks route contract test passed with `Synthetic demonstration data only`
  required across the OHWorks layout, pages, and assistant UI copy.
- The layout footer and assistant responses both preserve the same synthetic
  label string.
- Live browser validation of the label at desktop and mobile viewport sizes was
  blocked by the sandbox, which rejected any local HTTP listener.

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

## Commercial-claims filter proof

- Query `Show the unsafe approved record` returned `render_blocked`.
- Matched claim category: `supports_all_instruments`.
- Final answer was downgraded to the shared safe response plus the synthetic
  label, proving the filter runs immediately before render.

## Browser and build blockers

- `pnpm dev` failed on both `0.0.0.0:3000` and `127.0.0.1:3100` with
  `listen EPERM: operation not permitted`.
- Because no local listener could start, a true desktop/mobile browser
  walkthrough and screenshot capture could not be completed in this sandbox.
- `pnpm run typecheck` failed in unrelated files outside the allowed OHWorks
  edit surface:
  - `app/api/admin/personnel-pack/survey-export/route.ts`
  - `lib/prisma.ts`
  - `prisma/seed.ts`
- `pnpm run build` compiled the OHWorks route bundle, then failed while
  collecting page data for `/api/competencies/[id]/reviews/export` because
  `.prisma/client/default` was missing.
