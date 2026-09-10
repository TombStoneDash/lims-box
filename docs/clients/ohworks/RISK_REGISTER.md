# OHWorks supervised demo risk register

> Internal note: this file captures local implementation risks and should be
> redacted before customer-facing use.

| Risk | Current evidence | Impact | Mitigation |
|---|---|---|---|
| Discovery hypothesis mistaken for supported integration | UI now shows LIAISON XL and Orchidlive together | Unsafe expectation or sales drift | Repeat `hypothesis only` language in UI, docs, and assistant |
| Role switch mistaken for access control | Demo role simulator is visible on every route | User may infer auth exists | Label it `not authentication` and keep server-proof claims out |
| Employer or worker sees clinical detail | Multi-role views share the same route surface | Privacy and workflow-boundary regression | Filter every role-view and assistant record through S1 tenant/data-class policy |
| Release path coupled to ingestion | Common integration shortcut | Unauthorized release behavior | Separate workflow reducer states and require a distinct review event |
| Approved source contains unsafe claim text | Fictional knowledge can still drift into bad phrasing | Unsafe commercial language leaks into UI | Apply `filterCommercialClaims` immediately before render and test it directly |
| Pending or unapproved source is treated as approved | Discovery notes can look authoritative | Unsupported statements appear grounded | Admit every source through S1 and select approved records only |
| Visual proof goes stale after fixture changes | UAT and proof are hand-maintained | Future audits may reference old screenshots or notes | Update proof together with fixture or copy changes |
