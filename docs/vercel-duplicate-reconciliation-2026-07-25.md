# Vercel duplicate-project reconciliation — issue #70 receipt (2026-07-25)

## Current addendum — 2026-08-03 (read-only)

The duplicate-build problem has expanded from two projects to three. A single
push to `TombStoneDash/lims-box` now starts builds in all of these projects:

| Project | ID | Current role | Latest observed build |
|---|---|---|---|
| `lims-box` | `prj_Jxlddo9q4MtWHcM6zd4lE6uK9N26` | Canonical; owns `lims.bot` and `www.lims.bot` | READY |
| `limsbot` | `prj_x18WjgDIec3NIcPTKFGl56tCvjkf` | Legacy; owns five legacy product domains | READY |
| `lims-box-pr33` | `prj_TUyxDgwPadx9tZEnPAuj5mVTpyzP` | Stray project; no custom product domains | ERROR |

The three latest builds were created within 118 ms of one another from commit
`902167f6277f4aad638163eb4372417f15d7a673`. The stray project's build fails
with Prisma `P1012` because its `DATABASE_URL` is not a PostgreSQL URL. Do not
repair that environment: the project has no unique product domain and should
not be building this repository.

Production on both domain-owning projects is still pinned to
`146bb62ed247d0b9d00c01dd894fc9b5eca167b8`, not current `origin/main`
`def71b0c8cc6624f91016f3d8745439509452e8c`. Live proof agrees:
`https://lims.bot/demo/assistant` returns 404 although the route is present at
`def71b0`. This is a deployment/configuration gap, not a missing merge.

### Exact non-destructive reconciliation sequence

1. In all three projects, compare environment-variable **names and scopes**,
   deployment protection, integrations, webhooks, root directory, build
   command, production branch, and Ignored Build Step. Do not read or copy
   secret values.
2. If `lims-box-pr33` has no unique dependency, disconnect its Git integration
   or set an Ignored Build Step that always exits successfully. Preserve the
   project and deployments as rollback evidence; do not delete it.
3. In `limsbot`, confirm the five legacy domains have no dependency unique to
   that project. Move them to canonical `lims-box`, retaining the app-layer 308
   rules already merged in PR #73.
4. Disable Git-triggered builds on `limsbot`. Preserve the project and its
   deployment history.
5. Trigger no manual production deploy as part of reconciliation. On the next
   authorized `main` push, verify exactly one production build is created by
   `lims-box` and neither non-canonical project starts a build.
6. Verify `lims.bot`, `/bot`, `/demo/assistant`, and `/api/health`; verify all
   six non-canonical hosts return 308 with path and query preserved.
7. Stop and request Hudson review if either non-canonical project has a unique
   environment key, protection rule, integration, webhook, or domain behavior.

Rollback: reconnect the affected Git integration and/or return legacy domains
to `limsbot`. No project deletion is required.

Machine-safe portion of issue #70, executed read-only via the Vercel MCP
(project/deployment inspection) plus live HTTP checks. No Vercel setting,
domain, or deployment was changed. Names only — no secret values were read
or recorded.

## Verified current state (2026-07-25)

Duplication is still live. The latest `main` push (`5502975`, merged PR #71,
repo push 2026-07-21) produced **two** production builds 103 ms apart:

| | canonical `lims-box` | legacy `limsbot` |
|---|---|---|
| Project ID | `prj_Jxlddo9q4MtWHcM6zd4lE6uK9N26` | `prj_x18WjgDIec3NIcPTKFGl56tCvjkf` |
| Latest production | `dpl_GHSZs9YywiyrUynfaczdrepq3NwW` | `dpl_64NfdcR1P2SfbvWHgVJv2gic6Gzp` |
| Created (ms epoch) | 1784649537145 | 1784649537248 |
| State | READY, target production | READY, target production |
| Git binding | `TombStoneDash/lims-box` (repoId 1208951067) | `TombStoneDash/lims-box` (repoId 1208951067) — **same repo** |
| Production branch | `main` | `main` |
| Commit built | `55029752` | `55029752` — **same commit** |
| Framework / Node | nextjs / 24.x | nextjs / 24.x |
| Region | iad1 | iad1 |
| Custom domains | `lims.bot`, `www.lims.bot` | `limsbot.com`, `www.limsbot.com`, `limsbox.com`, `www.limsbox.com`, `thelimsbox.com` |
| Crons | none (`vercel.json` defines no crons; crons are repo-defined on Vercel) | none — same repo, same absence |

## Domain classification (issue #70 step 2)

Live checks 2026-07-25: every domain below returned HTTP 200 (full site,
no redirect) and every non-canonical domain already serves
`<link rel="canonical" href="https://lims.bot">`. Product intent is
therefore already declared in production; only the HTTP behavior is wrong.

| Domain | Serving project | Classification |
|---|---|---|
| `lims.bot` | canonical | **Canonical. Keep. Never redirect.** |
| `www.lims.bot` | canonical | Permanent-redirect to `lims.bot`. A `vercel.json` rule exists but is **ignored in production** (verified: HTTP 200) — `vercel.json` redirects do not apply to Next.js builds. Fixed at the app layer by this PR. |
| `limsbot.com`, `www.limsbot.com` | legacy | Permanent-redirect to `lims.bot` (canonical tag already points there). Covered by this PR once merged. |
| `limsbox.com`, `www.limsbox.com` | legacy | Same — permanent-redirect. Covered by this PR once merged. |
| `thelimsbox.com` | legacy | Same — permanent-redirect. Covered by this PR once merged. |

No domain required a retire decision; all five legacy domains have an
unambiguous destination already declared by the running product. **No
true-stop condition was hit for domains.**

## Unique runtime dependency on legacy `limsbot` (issue #70 step 4)

None found in the MCP-visible surface: identical repo, branch, commit,
framework, region, and cron absence. `next.config.js` redirects were
verified live on the legacy project (`limsbot.com/early-access` → 307
`…/early-adopter`), confirming the legacy deployment runs the identical
app config — which is also why the app-layer host redirects in this PR
will take effect on the legacy domains with no dashboard change.

**Residual dashboard-only checks** (not exposed via MCP; complete these in
the Vercel dashboard before disabling legacy builds — record names/scopes
only, never values):

1. Environment-variable **key names** diff between the two projects.
2. Deployment protection settings on each project.
3. Installed integrations / webhooks scoped to the legacy project.

## What this PR changes (code-safe, merge-gated, reversible)

- `next.config.js`: 308 host-redirects for all six non-canonical hosts →
  `https://lims.bot/:path*` (path and query preserved). Both Vercel
  projects build this repo, so one merge fixes `www.lims.bot` on the
  canonical project **and** converts all five legacy domains from
  duplicate product surfaces into permanent redirects — without moving a
  domain or touching a Vercel setting.
- `tests/ops/host-redirects.test.ts` + `test:host-redirects` script, wired
  into `vercel-build`, so a host can never silently drop out of the rule.
- Revert = revert the commit. No state outside git.

## Exact remaining sequence (dashboard, gated — NOT executed by this PR)

1. Merge this PR; let the normal dual build run once more.
2. Verify: all five legacy domains + `www.lims.bot` return 308 →
   `https://lims.bot/…`; `lims.bot` returns 200.
3. Complete the three residual dashboard checks above; stop and report if
   the legacy project has a unique env key, protection rule, integration,
   or webhook.
4. Move the five legacy domains from legacy `limsbot` to canonical
   `lims-box` (same app, same redirect rules — behavior is unchanged at
   every step, so this is outage-free in either order relative to step 5,
   but domains-first matches the issue's ordering).
5. Disable Git-triggered builds on legacy `limsbot` (Settings → Git →
   disconnect, or Ignored Build Step `exit 0`). **Do not delete** the
   project or its deployments — they are the rollback evidence.
6. Verify the next `main` push creates exactly **one** production build,
   `lims.bot` stays live, and all legacy domains still 308 correctly.

Rollback at any point: re-enable Git on the legacy project and/or re-add
the domains to it; app behavior is identical on both projects by
construction.

## Cost note

Issue #70 recorded 5.97K build CPU minutes (+70% cycle-over-cycle,
$0.11 overage at the July 13 snapshot). Every `main` push is proven above
to still build twice; completing steps 4–6 halves LIMS production build
spend going forward.
