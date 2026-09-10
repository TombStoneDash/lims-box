# OHWorks supervised demo source register

> Internal note: this file contains internal provenance categories and should
> be redacted before any customer-facing handoff.

## Confirmed facts used directly in this slice

| Source | What it supports | Boundary |
|---|---|---|
| Current task packet for `OHWORKS_SUPERVISED_DEMO_S2_EXECUTION_20260903_R3` | Exact scope, allowed paths, required checks, and receipt expectations | Direct authority for this local implementation only |
| S1 local code in `lib/bot/data-class.ts`, `lib/bot/source-registry.ts`, and `lib/bot/output-claims-filter.ts` | Tenant filtering, source admission, and commercial-claim guardrails | Existing local policy modules only; not live auth or deployment proof |
| Synthetic OHWorks fixtures under `fixtures/ohworks/` | Workflow states, fictional roles, source IDs, and assistant corpus | Fictional local evidence only |

## Customer-reported or historical planning inputs

| Source | What it suggests | Boundary |
|---|---|---|
| Prior OHWorks memory summary and local notes | Annual volume around `30,000-40,000`, cloud may be acceptable, LIAISON XL / Orchidlive may matter | Planning context only; not a validated customer specification |
| Earlier isolated OHWorks pilot docs under `docs/clients/ohworks/` | Discovery framing and synthetic UX patterns | Historical local work only |

## Assumptions intentionally kept open

| Assumption | Why it remains open |
|---|---|
| `LIAISON XL -> Orchidlive -> LIMS BOX` | No supplier packet or supported topology proof is present |
| Supplier transport and message format | No approved interface guide or sample messages are available |
| Production authorization shape | The demo role switch is not authentication and does not prove server policy |

## Explicit gaps

- No supplier-approved topology or live connection proof.
- No customer or patient data.
- No validated test menu, reference ranges, or release policy.
- No production hosting, deployment, or acceptance authority.
