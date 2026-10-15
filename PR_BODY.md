## Demo: real-product walk-through recording script

Adds a Playwright recording script and a page-by-page shot list for the LIMS BOX live product and the local Basic-auth SENAITE demonstration.

### Included

- `demos/SHOTLIST.md`: exact action, visible result, and one narration sentence for every shot.
- `demos/record.mjs`: 1920×1080 Chromium capture with visible 75 ms/character typing, 2–3 second screen pauses, slow scrolling, URL logging, separate live/local output files, and delivery copies under `/tmp/product-demos/lims-box/`.
- `demos/out/` is gitignored; recordings must never be committed.
- Live forms use `.example.test` identities and are filled but not submitted. The current `/environmental/intake` and `/clinical/intake` implementations are prospect forms, and submitting them would create customer-visible records contrary to the recording brief.
- The local capture uses only the throwaway `demo` / `demo` HTTP Basic credentials supplied at server startup.

### Product-truth notes

- The checked-in environmental and clinical intake pages do not contain the requested sample/patient accession fields. Their complete actual field set is name, email, lab name, lab size, accreditations, optional pain point, optional referral source, plus environmental field/bench split.
- Environmental collection, analysis, chain of custody, QC, and final report screens are therefore shown through the site's read-only `/demo/walkthrough` synthetic workflow.
- Clinical accession, specimen/panel, result review/sign-off, QC, and report screens are shown through the read-only `/demo/labs/clinical/*` workflow.
- There is no `/senaite-demo/samples` index route. The implemented sample page is `/senaite-demo/samples/SA-2026-0847`, and the local recording uses it.

### Planned live URLs

- `https://lims.bot/environmental`
- `https://lims.bot/environmental/intake`
- `https://lims.bot/demo/walkthrough`
- `https://lims.bot/clinical`
- `https://lims.bot/clinical/intake`
- `https://lims.bot/demo/labs/clinical`
- `https://lims.bot/demo/labs/clinical/accessions`
- `https://lims.bot/demo/labs/clinical/samples`
- `https://lims.bot/demo/labs/clinical/result-review`
- `https://lims.bot/demo/labs/clinical/qc`
- `https://lims.bot/demo/labs/clinical/reports`
- `https://lims.bot/clia-tracker`
- `https://lims.bot/demo/assistant`
- `https://lims.bot/personnel-pack`
- `https://lims.bot/survey-ready-export`
- `https://lims.bot/compliance`
- `https://lims.bot/pricing`

### Planned local URLs

- `http://localhost:3000/senaite-demo`
- `http://localhost:3000/senaite-demo/samples/SA-2026-0847`
- `http://localhost:3000/senaite-demo/qc`
- `http://localhost:3000/senaite-demo/equipment`
- `http://localhost:3000/senaite-demo/training`

### Verification and exact capture blocker

- `node --check demos/record.mjs`: pass.
- `git diff --check`: pass.
- `npm run lint -- --no-warn-ignored demos/record.mjs`: pass.
- `npm i -D playwright`: blocked because the worker environment cannot resolve `registry.npmjs.org` (`ENOTFOUND`), and Playwright is not present in the offline npm cache (`ENOTCACHED`).
- Live navigation is blocked because the same environment cannot resolve `lims.bot` (`curl: (6) Could not resolve host`).
- Local capture is blocked because the managed sandbox refuses both `0.0.0.0:3000` and `127.0.0.1:3000` listeners (`listen EPERM`).

No `.webm` could be produced in this worker, so file size is **not available** and nothing was copied to `/tmp/product-demos/lims-box/`. Once the runner has network and localhost-listener access, run:

```sh
npm i -D playwright
npx playwright install chromium
node demos/record.mjs live
ADMIN_BASIC_USER=demo ADMIN_BASIC_PASS=demo npm run dev
# In another shell after the local server is ready:
node demos/record.mjs local
```

The runner owns committing and pushing. Open one draft PR titled `demo: real-product walk-through recording script` after both recordings exist, are 4–8 minutes where applicable, have been copied to `/tmp/product-demos/lims-box/`, and their measured sizes have replaced the unavailable-size note above.
