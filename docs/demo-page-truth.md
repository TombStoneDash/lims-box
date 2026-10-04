# Demo copy and recording corrections — October 4, 2026

Source: `planning/LIMS_DEMO_RUNBOOK_20260804.md`, capability matrix and
"Known Gaps vs. Marketing Copy" (available in `/Users/ops/Hermes/`).
The matrix takes precedence over the runbook's older walkthrough narration.

- `/demo` custody: say "Demo signature shown. This click-to-sign preview uses
  synthetic custody records." The web demo does not lock the transfer chain or
  create a validated electronic signature; that signature capability is proposed.
- `/demo` footer: the web demo requires an internet connection. Offline operation
  belongs to the separate local Python voice subsystem, not this web app.
- `/demo/record` report: say "Synthetic report preview with example results and
  QC data." The static preview provides no regulatory compliance assurance,
  measured report generation time, or automatic production QC inclusion.

Regression coverage: `tests/demo/page-truth.test.ts`, automatically discovered by
`npm run test:all` via `scripts/run-all-tests.mjs` in Full Test Suite CI.
