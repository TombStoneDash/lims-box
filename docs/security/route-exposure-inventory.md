# Route exposure inventory

Snapshot of repository source at `087c4ab`, reviewed 2026-09-19. This is a test-only classification guard, not an authorization implementation or a live deployment check.

Run directly from the repository root (with the existing dependencies available):

```sh
node --import tsx --test tests/security/route-exposure-inventory.test.ts
```

The test recursively inventories `page.tsx`, `route.ts`, and `route.tsx` in `app/`. It excludes private folders beginning with `_`, removes route groups, and represents each dynamic or catch-all segment with `x`. Every public and pending-decision entry is exact; no prefix approvals are used. Adding a route requires classification, and deleting one requires removing its stale entry. Protection is derived from `isProtectedDemoPath`; overlapping classifications fail.

The matcher check verifies that middleware source names each protected prefix, following the sibling security test. It does not execute Next.js middleware or prove deployed access controls. The API GET check examines named exported GET functions and requires an honest reason containing `no personal data`. It is a source guard, not response-level data-flow analysis. For a future public GET that cannot meet that condition, explicitly record it in `NEEDS_REVIEW`, print the exception in the test, and document the concern instead of inventing a privacy claim.

## Buckets discovered today

| Bucket | Discovered files / normalized paths | Meaning |
| --- | --- | --- |
| PROTECTED | 35 | Covered by the existing demo protection helper. |
| PUBLIC_BY_DESIGN | 48 | Explicit public purpose recorded in the test. |
| KNOWN_UNPROTECTED_PENDING_OWNER_DECISION | 9 | Explicit OHWorks exceptions; no implied approval to expose real data. |

Each row below is one discovered page or handler. Dynamic `x` values are inventory placeholders, not actual records.

| Bucket | Route | Kind | Reason |
| --- | --- | --- | --- |
| KNOWN_UNPROTECTED_PENDING_OWNER_DECISION | `/pilot/ohworks` | Page | Synthetic supervised pilot; owner access decision pending. |
| KNOWN_UNPROTECTED_PENDING_OWNER_DECISION | `/pilot/ohworks/accessions` | Page | Synthetic supervised pilot; owner access decision pending. |
| KNOWN_UNPROTECTED_PENDING_OWNER_DECISION | `/pilot/ohworks/audit` | Page | Synthetic supervised pilot; owner access decision pending. |
| KNOWN_UNPROTECTED_PENDING_OWNER_DECISION | `/pilot/ohworks/audit/export` | Route handler | Synthetic supervised pilot; owner access decision pending. |
| KNOWN_UNPROTECTED_PENDING_OWNER_DECISION | `/pilot/ohworks/bot` | Page | Synthetic supervised pilot; owner access decision pending. |
| KNOWN_UNPROTECTED_PENDING_OWNER_DECISION | `/pilot/ohworks/bot/api` | Route handler | Synthetic supervised pilot; owner access decision pending. |
| KNOWN_UNPROTECTED_PENDING_OWNER_DECISION | `/pilot/ohworks/instrument` | Page | Synthetic supervised pilot; owner access decision pending. |
| KNOWN_UNPROTECTED_PENDING_OWNER_DECISION | `/pilot/ohworks/personnel` | Page | Synthetic supervised pilot; owner access decision pending. |
| KNOWN_UNPROTECTED_PENDING_OWNER_DECISION | `/pilot/ohworks/samples` | Page | Synthetic supervised pilot; owner access decision pending. |
| PROTECTED | `/admin` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/competencies/new` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/competencies/x` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/documents` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/documents/new` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/documents/x` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/people` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/people/new` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/people/x` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/people/x/edit` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/procedures` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/procedures/new` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/procedures/x` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/signoffs/new` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/survey-ready` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/survey-ready/pdf` | Route handler | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/admin/trainings/new` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/api/admin/conversion-report` | Route handler | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/api/admin/personnel-pack/survey-export` | Route handler | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/api/authorizations/x/revoke` | Route handler | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/api/competencies/x/reviews` | Route handler | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/api/competencies/x/reviews/export` | Route handler | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/api/documents` | Route handler | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/api/documents/x/versions` | Route handler | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/api/documents/x/versions/current` | Route handler | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/api/people/x/authorizations` | Route handler | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/api/procedures` | Route handler | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/api/procedures/x/authorized-personnel` | Route handler | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/api/reviews/upcoming` | Route handler | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/demo/operator` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/senaite-demo` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/senaite-demo/equipment` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/senaite-demo/qc` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/senaite-demo/samples/x` | Page | Existing fail-closed demo Basic Auth policy. |
| PROTECTED | `/senaite-demo/training` | Page | Existing fail-closed demo Basic Auth policy. |
| PUBLIC_BY_DESIGN | `/` | Page | Public product landing page. |
| PUBLIC_BY_DESIGN | `/about` | Page | Public company introduction. |
| PUBLIC_BY_DESIGN | `/api/bot` | Route handler | Public prototype questions; GET returns usage instructions and no personal data. |
| PUBLIC_BY_DESIGN | `/api/checkout/personnel-pack` | Route handler | Public early-adopter redirect; GET returns no personal data. |
| PUBLIC_BY_DESIGN | `/api/contact` | Route handler | Public contact-form submission. |
| PUBLIC_BY_DESIGN | `/api/demo` | Route handler | Hardcoded synthetic integration examples; no personal data. |
| PUBLIC_BY_DESIGN | `/api/demo/assistant` | Route handler | Public synthetic assistant; GET returns usage instructions and no personal data. |
| PUBLIC_BY_DESIGN | `/api/early-access` | Route handler | Public early-access application submission. |
| PUBLIC_BY_DESIGN | `/api/health` | Route handler | Stateless service health and timestamp; no personal data. |
| PUBLIC_BY_DESIGN | `/api/newsletter` | Route handler | Public newsletter signup submission. |
| PUBLIC_BY_DESIGN | `/api/personnel-pack-download` | Route handler | Public pack request; GET serves a fixed reviewed documentation PDF, no personal data. |
| PUBLIC_BY_DESIGN | `/api/prospects` | Route handler | Public lab-interest intake submission. |
| PUBLIC_BY_DESIGN | `/api/unsubscribe` | Route handler | Public opt-out; GET changes suppression state but returns a generic confirmation with no personal data. |
| PUBLIC_BY_DESIGN | `/api/waitlist` | Route handler | Public waitlist signup submission. |
| PUBLIC_BY_DESIGN | `/blog` | Page | Public article index. |
| PUBLIC_BY_DESIGN | `/blog/x` | Page | Public published article. |
| PUBLIC_BY_DESIGN | `/bot` | Page | Public prototype assistant interface. |
| PUBLIC_BY_DESIGN | `/case-study` | Page | Public product case study. |
| PUBLIC_BY_DESIGN | `/clia` | Page | Public CLIA product information. |
| PUBLIC_BY_DESIGN | `/clia-tracker` | Page | Public personnel-tracker product information. |
| PUBLIC_BY_DESIGN | `/clinical` | Page | Public clinical-lab product information. |
| PUBLIC_BY_DESIGN | `/clinical/intake` | Page | Public clinical-lab interest form. |
| PUBLIC_BY_DESIGN | `/cola` | Page | Public COLA product information. |
| PUBLIC_BY_DESIGN | `/commercial` | Page | Public commercial offering information. |
| PUBLIC_BY_DESIGN | `/compare` | Page | Public product comparison. |
| PUBLIC_BY_DESIGN | `/compliance` | Page | Public compliance product information. |
| PUBLIC_BY_DESIGN | `/contact` | Page | Public contact form. |
| PUBLIC_BY_DESIGN | `/demo` | Page | Public browser-local walkthrough. |
| PUBLIC_BY_DESIGN | `/demo/assistant` | Page | Public assistant using fabricated records. |
| PUBLIC_BY_DESIGN | `/demo/record` | Page | Public staged demo recording screens. |
| PUBLIC_BY_DESIGN | `/demo/walkthrough` | Page | Public staged product walkthrough. |
| PUBLIC_BY_DESIGN | `/early-adopter` | Page | Public early-adopter application. |
| PUBLIC_BY_DESIGN | `/environmental` | Page | Public environmental-lab product information. |
| PUBLIC_BY_DESIGN | `/environmental/intake` | Page | Public environmental-lab interest form. |
| PUBLIC_BY_DESIGN | `/evidence` | Page | Public capability and evidence matrix. |
| PUBLIC_BY_DESIGN | `/faq` | Page | Public product questions and answers. |
| PUBLIC_BY_DESIGN | `/field-scout` | Page | Public field-workflow examples and interest form. |
| PUBLIC_BY_DESIGN | `/for/cannabis-labs` | Page | Public cannabis-lab product information. |
| PUBLIC_BY_DESIGN | `/for/environmental-labs` | Page | Public environmental-lab product information. |
| PUBLIC_BY_DESIGN | `/partners` | Page | Public partnership information. |
| PUBLIC_BY_DESIGN | `/personnel-pack` | Page | Public documentation-pack request form. |
| PUBLIC_BY_DESIGN | `/press` | Page | Public press information. |
| PUBLIC_BY_DESIGN | `/pricing` | Page | Public plan information. |
| PUBLIC_BY_DESIGN | `/roi-calculator` | Page | Public savings estimator. |
| PUBLIC_BY_DESIGN | `/start` | Page | Public lab-type selection. |
| PUBLIC_BY_DESIGN | `/survey-ready-export` | Page | Public survey-export product information. |
| PUBLIC_BY_DESIGN | `/unsubscribe` | Page | Public opt-out form. |
| PUBLIC_BY_DESIGN | `/webinar` | Page | Public webinar information. |

## Known unprotected: OHWorks supervised pilot

These nine routes serve synthetic data only. The layout explicitly says "Demo role simulator - not authentication". They are outside the current demo protection helper and middleware matcher:

- `/pilot/ohworks` — overview page.
- `/pilot/ohworks/accessions` — accessions page.
- `/pilot/ohworks/audit` — audit page.
- `/pilot/ohworks/audit/export` — GET CSV route handler.
- `/pilot/ohworks/bot` — bot page.
- `/pilot/ohworks/bot/api` — POST route handler.
- `/pilot/ohworks/instrument` — instrument page.
- `/pilot/ohworks/personnel` — personnel page.
- `/pilot/ohworks/samples` — samples page.

Nothing in this PR changes access. Gating these routes requires an owner decision plus a middleware change, with the protection helper kept consistent. The test compares the explicit pending list to the discovered OHWorks routes that are still unprotected. When the owner gates the entire pilot, the expected list becomes empty and the test forces all nine exceptions to be removed. A newly added pilot route also fails until explicitly classified.

## Public API GET review

No existing public GET required a `NEEDS_REVIEW` exception during this source review:

- `/api/bot` and `/api/demo/assistant` return static POST usage instructions with status 405.
- `/api/health` returns service status and a timestamp.
- `/api/demo` returns hardcoded synthetic examples.
- `/api/checkout/personnel-pack` redirects to the early-adopter page.
- `/api/personnel-pack-download` serves the fixed, hash-checked reviewed documentation PDF from public assets, not stored lead records.
- `/api/unsubscribe` returns generic confirmation/error HTML. It **does** process an email input and change suppression state; "no personal data" describes the response, not an absence of personal-data processing or side effects.

Public POST endpoints can accept contact information. Their public classification does not claim that they never process personal data, nor does this inventory test invoke them, submit forms, or send email.
