# Corpus published-copy drift guard

Run from the repository root:

```sh
node --import tsx --test tests/bot/corpus-published-copy.test.ts
```

The guard resolves each corpus source to `app/<path>/page.tsx` (`/` resolves to
`app/page.tsx`). It reads the page and its direct imports from `./`,
`@/components/`, `@/content/`, and `@/data/`, including extensionless files and
index modules. It does not recursively follow imports or fetch the deployed site.
This checks the published-page source in this checkout, not deployment status or
the truth of the claims themselves. It is a static source check, not a rendering
check; conditional content and data literals can supply evidence.

Both corpus and page text have JSX tags and explicit JSX spaces removed, HTML
entities decoded, curly quotes/dashes mapped to ASCII, escaped string quotes
unescaped, and whitespace collapsed. Every complete sentence must occur in an
individual source file; final fragments are checked too. Decimal method numbers,
section numbers, email addresses, and prices remain intact. Failures identify the
entry, missing sentence(s), and source page. Page existence, unique ids, at least
three keywords, and both canonical commercial-claims filters are checked as well.

The test is standalone: `npm run test:bot` currently enumerates other files and
does **not** include it. CI/runners must invoke the command above explicitly;
package scripts and deployment configuration were outside this task's scope.

## Corrections and exceptions

- `early-access` had two sentences absent from its source, including a same-day
  founder-review promise. Replaced them with the current page sentence:
  “We review every application personally and will contact you after review.”
  The entry remains useful; no entire entries were removed.
- All 15 FAQ entries still match, including `pricing` and its published dollar
  amounts. The homepage, commercial overview, and bot description also match;
  the bot description is in the directly imported `app/bot/bot-chat.tsx`.
- `compliance-positioning` is the sole `KNOWN_UNVERIFIED` entry. The locked
  `COMPLIANCE_POSITIONING` sentence was not found verbatim in any `app/**/page.tsx`
  or eligible direct import. It is preserved unchanged. The exception is reported
  in test diagnostics and must be removed once the exact sentence is published;
  the test fails if the exception becomes obsolete. This remains a known gap in
  the corpus's publication promise.
- `part-11` is the sole `CLAIMS_FILTER_EXEMPT_EXISTING` entry. Its existing,
  published disclaimer contains “Part 11 compliance,” triggering both lexical
  filters even though it denies that LIMS BOX holds certification. The text is
  unchanged. Pricing does not trigger either current filter and has no exemption.
  None of the new entries has either exemption.

## Added entries

| Id / source | Published text selected |
| --- | --- |
| `personnel-pack` / `/personnel-pack` | First hero sentence describing personnel competency documentation for both frameworks. |
| `clia-tracker` / `/clia-tracker` | Hero sentence describing certifications, assessments, training, authorization, and audit trail. |
| `survey-ready-export` / `/survey-ready-export` | Three hero sentences describing the personnel packet and export. |
| `roi-calculator` / `/roi-calculator` | Hero invitation plus the benchmark and actual-savings caveats. |

Each has eight lowercase keywords, one to three verbatim published sentences,
no price/dollar amount, and passes both claims filters. Behavior tests assert the
selected answer and source, no lead follow-up, and unchanged evidence-missing
behavior for an unrelated question. No existing id fixtures needed changes.

The existing engine prepends locked compliance positioning and `/compliance` for
“do you have a clia tracker”; the product source is therefore `sources[1]`, not
`sources[0]`. The test explicitly preserves this contract and additionally checks
that “what is the tracker” returns `/clia-tracker` first. The other three product
questions return their product source first. Engine, lead-intent ids, UI, and
existing engine tests are unchanged.

## Verification

- New guard: 56/56 passed (the first full run caught early-access drift and the
  missing locked positioning before correction/exception).
- `npm run test:bot`: 50/50 passed.
- Each remaining bot file run individually with `node --import tsx --test <file>`:
  `data-class` (5), `intent-fixtures` (4), `model-receipt` (6),
  `output-claims-filter` (6), `source-registry` (11), all passed.
- `npm run test:commercial-claims`: 9/9 passed.
- `npm run lint`: passed.
- `npm run typecheck`: failed outside the changed files:
  `app/api/admin/personnel-pack/survey-export/route.ts:281` reports TS2740 (`{}`
  is not `Uint8Array`); `lib/admin/conversionReport.ts:1`, `lib/prisma.ts:1`, and
  `prisma/seed.ts:1` report missing `PrismaClient` exports from `@prisma/client`.
  No protected files or Prisma generation were changed to address these errors.

The worktree initially had no dependencies. Verification used a local symlink to
the factory checkout's existing `node_modules`; no installation or network access
was used. No commit, push, or deployment was performed. Recovery is to revert the
corpus diff and remove the two new files.
