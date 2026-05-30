---
title: "Personnel Pack v1.5: ISO 15189 §6.2 Coverage, Authorization Records, and a DB-Layer Fix"
slug: "personnel-pack-v1-5-release"
description: "Personnel Pack v1.5 ships procedure-specific authorization records, a competency review audit trail, document version control, and a partial-unique-index fix that closes the duplicate-active-authorization loophole. Additive. Same price. Auto-applied to existing customers."
author: "LIMS BOX Team"
authorRole: "Lab Software Engineering"
publishedAt: "2026-05-30"
updatedAt: "2026-05-30"
category: "Product"
tags: ["personnel-pack", "ISO 15189", "changelog", "compliance"]
---

Personnel Pack v1.5 is live. Here's what shipped and why.

## What's new

**Procedure authorization records** (ISO 15189 §6.2.4)

Each person can now hold explicit, timestamped authorizations for specific lab procedures. Authorizations are signed, scopeable to a procedure version, and fully revocable — with a reason log on every revocation. This satisfies the §6.2.4 requirement for unambiguous authorization records per person per procedure.

**Duplicate protection at the database layer**

v1.0 had a soft-delete loophole: a composite unique index on `(personnel_id, procedure_id, authorized_at)` allowed two active authorization records to coexist for the same person and procedure as long as they had different timestamps. That's a quiet data integrity failure — both rows appear active, and any downstream query reading authorization status gets an ambiguous answer.

The fix is a partial unique index: `UNIQUE on (personnel_id, procedure_id) WHERE is_active = TRUE`. Active rows are constrained to one per key. Revoked records coexist cleanly in the same table. The database now rejects a duplicate active insert before application logic runs. Full technical writeup: [the partial-unique-index post](/blog/personnel-pack-iso-15189-what-small-labs-need-to-know).

**Competency review audit trail** (ISO 15189 §6.2.2)

Every review event is now logged as an immutable record: reviewer name, role, outcome (competent / requires remediation / restricted / suspended), and next review due date calculated from the review date. Exportable to PDF in one click.

**Document version control** (ISO 15189 §6.2.1 / §4.3)

Competency procedures and SOPs now support controlled-document versioning: version number, effective date, revision summary, approver sign-off, and superseded copies archived. CLIA focuses document control on procedure manuals; ISO 15189 extends it to everything in the QMS — this closes that gap.

**Reviews-due dashboard widget**

Lab directors see upcoming competency assessments in a 30-day horizon view without running a manual query. No more scheduling drift.

## What didn't change

Everything. v1.5 is additive — existing competency records are unaffected, no migration required for existing data, no new module, no new pricing tier. Existing customers are automatically on v1.5.

## The compliance context

COLA was authorized to evaluate US labs against ISO 15189 in 2026. Labs that previously had to choose between CLIA and ISO 15189 accreditation can now pursue both through one body. The overlap between CLIA §493.1407 and ISO 15189 clause 6.2 is roughly 80% — same six competency assessment elements, same documentation requirements, same corrective action structure.

The 20% gap is documentation metadata: controlled forms, timestamped review logs, and procedure-specific authorization records. That's what v1.5 adds.

---

Questions about the authorization data model or the migration path from v1.0? [Contact us](/contact).
