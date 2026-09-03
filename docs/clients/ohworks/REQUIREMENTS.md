# OHWorks supervised demo requirements

## Confirmed facts for this increment

1. The build is local-only and uses synthetic demonstration data only.
2. The role switch is a visual simulator and not authentication.
3. Every role-view and assistant record selection must pass through the S1
   `filterByDataClass` policy with exact tenant matching.
4. Source admission for assistant knowledge must pass through the S1
   `admitSource` policy, and only approved fictional sources may be cited.
5. `filterCommercialClaims` must be applied immediately before rendering every
   assistant candidate.
6. Ingestion creates only `Instrument result` or `Quarantined`.
7. Release succeeds only after a distinct authorized `Technical review` event.

## Customer-reported planning inputs

1. The annual planning range is roughly `30,000-40,000` samples.
2. Cloud hosting may be acceptable.
3. LIAISON XL and Orchidlive were mentioned as possible discovery subjects.

These are planning inputs only. They are not implementation authority for a
live integration, validation, or deployment claim.

## Assumptions held open

1. The supplier topology might be `LIAISON XL -> Orchidlive -> LIMS BOX`.
2. A future production workflow may need parser and mapping version controls.
3. Reviewer and release roles will likely need stronger server-side controls
   than the local simulator demonstrates.

These assumptions remain visible and must not be converted into claims of
support or readiness.

## Discovery gates

1. Exact topology, protocol, transport, versions, and field-level support.
2. Supplier interface guide, sample messages, test environment, and licensing.
3. Source-of-truth ownership across orders, results, amendments, and releases.
4. Identity model, access review, joiner-mover-leaver, and retention policy.
5. Pilot success metric, acceptance owner, rollback trigger, and validation plan.

## Fail-closed acceptance boundary

This slice may prove local software behavior only. It cannot prove customer
workflow fit, live connectivity, compliance, accreditation, production
security, clinical safety, measured error reduction, or production readiness.
