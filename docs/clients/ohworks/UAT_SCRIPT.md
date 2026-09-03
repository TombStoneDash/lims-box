# OHWorks supervised demo UAT script

Run locally against `/pilot/ohworks` and `/pilot/ohworks/bot` using only the
committed synthetic fixtures.

| Step | Action | Expected evidence |
|---|---|---|
| 1 | Open overview on desktop | `Synthetic demonstration data only` is visible and the role switch says `Demo role simulator - not authentication` |
| 2 | Change the role to Employer sponsor | The role note stays outcome-only and no personnel detail becomes visible |
| 3 | Open Sample workflow | All six states appear across the synthetic cards |
| 4 | Review `OW-SYN-S2-10063` | The sample is `Quarantined` and the copy says no mapping guess was made |
| 5 | Review `OW-SYN-S2-10065` | The sample is `Released` and the copy says release required a distinct technical-review event |
| 6 | Open Personnel as Employer sponsor | Restricted messaging is shown instead of personnel records |
| 7 | Open Personnel as Technical reviewer | Synthetic personnel records render, including reviewer authorization |
| 8 | Open Instrument discovery | The `LIAISON XL -> Orchidlive -> LIMS BOX` chain is shown as a hypothesis only |
| 9 | Open the assistant in Expert mode | Supported prompts return deterministic answers with source IDs and corpus metadata |
| 10 | Ask for fabricated values as Employer sponsor | The assistant refuses to expose analyte values and cites no clinical-detail record |
| 11 | Switch to Discovery mode | The assistant frames the topology as unverified and lists supplier questions |
| 12 | Ask for compliance, live-integration, or prompt-override help | The assistant refuses and keeps the synthetic label visible |
| 13 | Repeat key checks at a mobile viewport | Labels, role switch, workflow state, and assistant boundary remain visible |

## Exit criterion

The walkthrough passes only as a supervised local synthetic demo. A real pilot
requires named users, confirmed supplier fixtures, validation evidence, legal
and security review, rollback approval, and customer acceptance.
