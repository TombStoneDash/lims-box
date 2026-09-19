# Google OAuth client reference audit

Audit date: 2026-09-19. Repository: `TombStoneDash/lims-box`.
Audited source: `c1a2ab5d28a171524b114fb938701a62649a2261`, branch
`codex/34-lims-95-oauth-client-audit`.

## Finding and scope

**No Google OAuth client ID/secret environment-variable references or Google
sign-in/token-exchange implementation were found in the tracked application.**
There is no code-backed Google OAuth client to classify as active or dead at
this revision. The four matches from the requested search are unrelated
synthetic laboratory client identifiers. Two explicit OAuth filenames and a
wildcard in `.gitignore` are possible historical tooling traces, not runtime
configuration.

This does **not** establish that any actual Google Cloud client is unused or
safe to let expire. Client existence, deployment-injected variables, external
consumers, last-use timestamps, and the production deployment's source revision
were not inspected. No real credential files, Google Cloud Console, OAuth flows,
or production services were accessed or changed.

[Issue #95](https://github.com/TombStoneDash/lims-box/issues/95) was read in full,
including its empty comment list, through the GitHub connector after the requested
`gh issue view 95 -R TombStoneDash/lims-box` failed to connect to `api.github.com`.
The issue reports an August 27 warning about clients inactive for at least five
months, with required clients to be exercised before **2026-09-26**. Its broader
live inventory, keep/retire, and authentication acceptance criteria remain open;
this document completes only the requested repository audit.

## Reference inventory

Paths and line numbers refer to the audited revision above. None of the following
entries exposes a real OAuth identifier or secret.

| Reference | Feature / purpose | Current code-use classification | OAuth disposition |
| --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH*` | No feature found | No references in application source, example environment file, or checked-in deployment configuration | No repository client to map; real clients unknown |
| `lib/ohworks-senaite-create.ts:21` — `clientId: string` | Synthetic lab customer identity in `OHWorksSampleCreateRequest` | Contract type; only tracked importer is its test file, not an application route | Not OAuth; no environment variable |
| `lib/ohworks-senaite-create.ts:141` — `candidate.clientId` | Rejects a sample-create request missing its customer identity | Executed by contract tests through `createOHWorksSenaiteSample`; no production caller found | Not OAuth; retain |
| `tests/ohworks/senaite-create-contract.test.ts:28` — `clientId` | Fabricated baseline sample request | Active test fixture | Not OAuth; retain |
| `tests/ohworks/senaite-create-contract.test.ts:312` — `request.clientId` | Empty identity rejection test | Active negative test | Not OAuth; retain |
| `senaite/client.py:101,107` — `client_id`, JSON `Client` | Laboratory customer identifier passed to SENAITE sample creation | Integration helper; uses Basic Auth, not Google authentication; live use unverified | Not OAuth; retain |
| `.gitignore:63` — `config/youtube-client-secret.json` | Ignore rule protecting a possible local YouTube OAuth credential file | No tracked reader or YouTube integration found; possible vestigial tooling reference | File contents/existence and associated client unknown; keep protection |
| `.gitignore:64` — `config/youtube-oauth-token.json` | Ignore rule protecting a possible local OAuth token file | No tracked reader found; not evidence of a running token-exchange path | Client association unknown; keep protection |
| `.gitignore:65` — `config/youtube-*.json` | Broader credential-file exclusion | Protective rule, not executable code or client configuration | Keep protection; do not inspect matching files |

Other Google matches are unrelated: `app/layout.tsx:39` sets crawler metadata,
`app/layout.tsx:67` preconnects to Google Fonts, and `app/contact/page.tsx:214`
and `content/blog/lims-box-launch.md:30` mention Google Sheets in product copy.
`DemoAuthorization` in `lib/demo-operator-state.ts` is a substring search false
positive for `oauth`, not an OAuth provider.

## Environment and deployment cross-reference

| Surface inspected | Evidence | Meaning for this audit |
| --- | --- | --- |
| `.env.example` (only environment file read) | Declares `DATABASE_URL`, `ADMIN_BASIC_USER`, `ADMIN_BASIC_PASS`, `RESEND_API_KEY`; comments describe `VERCEL_ENV` | No Google OAuth variables or callback configuration |
| `middleware.ts`, `lib/demo-access.ts` | Protected admin/demo routes read `ADMIN_BASIC_USER` and `ADMIN_BASIC_PASS`; missing configuration returns 503, invalid credentials 401 | Current wired authentication path is HTTP Basic Auth; production credentials/behavior not verified |
| `lib/supabase.ts`, contact/personnel-pack download/unsubscribe API routes | Supabase data persistence uses URL and service/anon key variables; clients disable session persistence and automatic token refresh | No `signInWithOAuth` or Google provider selection found. Supabase variables absent from `.env.example` are a separate documentation gap, not missing Google clients |
| `vercel.json` | Next.js framework and host redirect only | No OAuth environment declarations |
| `next.config.js` | Host redirects and build/image settings | No OAuth provider, callback, or client variable wiring |
| `package.json`, `scripts/vercel-db-push-gate.mjs` | Next.js build, Prisma generation, test/typecheck scripts; production database push gate | No Google client wiring. `vercel-build` can write to a database and was not run |
| All five `.github/workflows/*.yml` files | Install/test/lint/typecheck/build workflows; some use a synthetic database URL | No Google OAuth key or secret mapping |
| `docs/vercel-duplicate-reconciliation-2026-07-25.md` | Historical discussion of canonical `lims-box`, legacy `limsbot`, and `lims-box-pr33`; environment key comparisons were outstanding | Historical context only; does not establish current deployment settings or absence of Google keys |

Supabase variable names observed are `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. These are database-service configuration, not
Google OAuth client ID/secret variables. A hosted Supabase provider configured
outside this repository cannot be ruled out by this source audit.

## Reproduction and verification

The requested search was run before dependencies were installed and returned
exactly the four TypeScript matches listed above:

```sh
grep -rn 'GOOGLE_CLIENT_ID\|GOOGLE_OAUTH\|clientId' --include='*.ts' --include='*.env.example' .
```

A broader tracked-file search included TSX, Python, scripts, hidden configuration,
and docs, while excluding real environment files and dependency lockfiles:

```sh
git ls-files -z ':!:*.env*' ':!:.env*' ':!:package-lock.json' ':!:pnpm-lock.yaml' |
  xargs -0 rg -n -i 'google|oauth|client.?id|client.?secret|signInWithOAuth|next-auth|nextauth|accounts\.google|googleapis'
```

The broader command was run before adding this document (which itself contains
search terms). `.env.example` was inspected separately. Call-site searches and
direct source reads distinguished test-only contracts from wired middleware.

Verification on Node `v22.22.2`, npm `10.9.7`:

- `npm ci --offline --ignore-scripts --no-audit --no-fund`: PASS, using the local
  package cache; no lockfile changes.
- Prisma generation: initial default-cache attempt failed with sandbox `EPERM`.
  Copied the existing engine cache into `/private/tmp/lims95-prisma-cache` and ran
  `XDG_CACHE_HOME=/private/tmp/lims95-prisma-cache ./node_modules/.bin/prisma generate`:
  PASS. Prisma explicitly skipped environment-file loading; no database operation.
- `npm run typecheck`: PASS (exit 0) after client generation. The initial attempt
  before generation failed due to unavailable generated Prisma types.
- `node --import tsx --test tests/security/demo-access.test.ts tests/ohworks/senaite-create-contract.test.ts tests/security/vercel-db-gate.test.mjs tests/ops/host-redirects.test.ts`:
  PASS, **43 tests, zero failures**. These exercise authentication policy, the
  `clientId` contract, and deployment configuration locally with synthetic inputs.
- Typecheck was the chosen repository verification command. A full Next.js build
  and live authentication check were not performed. `next.config.js` allows build
  type errors, so a build alone would not substitute for the passing typecheck.

Only this audit document is added; runtime code, example environment settings,
and real credentials are unchanged. No commit, push, deployment, or outbound
message was performed.

## Suggested follow-up — not executed

1. Before the issue's September 26 deadline, have the project owner reconcile the
   warning's actual client inventory against production, preview, local, hosted
   provider, and external tooling consumers. Record opaque client aliases, owner,
   environment, purpose, redacted verification time, and keep/retire evidence.
   None of those per-client decisions can be made from this repository alone.
2. Specifically check whether the ignored YouTube credential filenames belong to
   separately operated tooling. Lack of a tracked consumer is insufficient to
   retire a Google client or remove protective ignore rules.
3. Any required sign-in/refresh exercise or production authentication verification
   belongs to a separately authorized live follow-up. Do not treat these local
   tests as proof that a warned client remains valid.
4. No dead Google OAuth environment-variable reference was found to remove. If a
   later authorized inventory identifies one, document the missing client and
   propose code/config cleanup separately; this audit authorizes no removals.

**Keep/retire decision for actual cloud clients: unresolved.** Issue #95 is not
closed by this source-only audit, and no client is designated safe to expire.
