---
title: "Personnel Pack v1.5: What ISO 15189 Actually Requires for Personnel Authorization"
slug: "personnel-pack-iso-15189-what-small-labs-need-to-know"
description: "ISO 15189 clause 6.2 demands a documented trail of competency assessments, authorization records, and ongoing evaluations. Personnel Pack v1.5 makes that trail survivable for small labs."
author: "LIMS BOX Team"
authorRole: "Lab Software Engineering"
publishedAt: "2026-05-30"
updatedAt: "2026-05-30"
category: "Compliance"
tags: ["ISO 15189", "personnel-pack", "compliance"]
readingTime: 6
featured: false
---

## The Paper Trail Nobody Talks About

Most lab directors will tell you ISO 15189 is about method validation, measurement uncertainty, and QC procedures. And it is. But there's a quieter requirement in clause 6.2 that trips up small labs at almost every assessment: the personnel authorization record.

Not just "who is authorized." The documentation of *how* that authorization was established — the initial competency assessment, the ongoing evaluation schedule, the evidence that each analyst was assessed by a qualified supervisor, and the record that someone signed off on the conclusion.

In a five-person lab, this sounds manageable. Then you realize you have three analysts, two methods each, assessments due on different cycles, a supervisor who left in February, and a file cabinet full of paper forms that may or may not have been signed in the right order.

That's the problem Personnel Pack was built to solve.

---

## What ISO 15189 Clause 6.2 Actually Requires

The 2022 revision of ISO 15189 tightened the personnel requirements considerably. The standard now asks labs to demonstrate:

- **Authorization by competence, not job title.** Each person must be authorized for each specific examination procedure they perform. "Senior analyst" isn't sufficient — the record needs to show they were assessed on that specific method.

- **Documented initial competency assessment.** Before an analyst performs examinations unsupervised, there must be a documented evaluation: direct observation, blind sample testing, or some combination. The assessment method itself needs to be recorded.

- **Ongoing evaluation.** Not a one-time thing. The standard expects periodic re-assessment, with records showing when it happened, who performed it, and what the outcome was.

- **Traceability of authorization.** If an assessor asks "show me the authorization chain for this result," you need to be able to pull a record that connects the result → the analyst → the authorization → the competency assessment → the supervisor who signed off.

In a well-resourced reference lab with a dedicated QA department, this is a documentation workflow problem. In a small environmental lab with a lab director who also processes samples, it's a genuine operational burden.

---

## The Specific Problem With Soft-Delete

One thing that comes up constantly in real lab operations: personnel leave. Analysts resign, retire, go on extended leave. Their authorization records don't disappear — ISO 15189 requires you to retain historical records for defined periods — but you need to mark them as inactive without destroying the audit trail.

In database terms, this is the soft-delete problem. You don't want to hard-delete a personnel record because you lose the history. You want to mark it inactive while preserving everything that was there.

The naive implementation — an `active` boolean column — runs into trouble the moment you try to enforce uniqueness constraints. If you have a unique index on `(personnel_id, procedure_id)` to prevent duplicate authorizations, a soft-deleted record blocks you from re-authorizing the same person on the same procedure after a leave of absence.

Personnel Pack v1.5 solves this with **partial unique indices**. The unique constraint only applies to active records:

```sql
CREATE UNIQUE INDEX personnel_authorization_active_unique
ON PersonnelAuthorization (personnelId, procedureId)
WHERE deletedAt IS NULL;
```

This means:
- You can soft-delete an authorization when someone goes inactive
- The historical record survives, attached to the assessment chain
- You can re-authorize the same person on the same procedure without fighting the constraint
- Audit queries against historical data still work correctly

It sounds like a small technical detail. In practice, it's what allows the data model to match how lab personnel actually move through the authorization lifecycle — including gaps, re-entries, and role changes.

---

## What v1.5 Ships

Personnel Pack v1.5 is a focused update. The core change is the partial unique index pattern applied across all authorization tables, which unblocks a set of real-world workflows that the v1.0 schema couldn't handle cleanly.

Specifically:

**Authorization records that survive personnel gaps.** When someone leaves and returns — even years later — you can re-establish authorization without corrupting the historical record of their prior authorizations.

**Competency assessment linkage.** Each authorization record now explicitly references the competency assessment that established it. The link is queryable: you can pull "show me every authorization and its supporting assessment" in a single query.

**Assessor traceability.** The supervisor or qualified assessor who performed each competency evaluation is recorded as a foreign key, not a free-text field. That matters when the assessor later leaves the organization — you still have a structured record, not just a name in a comment.

**Assessment method recording.** Direct observation, blind sample, parallel testing, proficiency examination — the method used for each assessment is now a structured field, not an ad-hoc note.

---

## Why This Matters More for Small Labs

Large labs have QA managers, document control specialists, and LIS systems with dedicated compliance modules. They handle the ISO 15189 personnel documentation burden with dedicated infrastructure and headcount.

Small labs — a five-person clinical lab, a water testing facility, an environmental reference lab doing metals and VOCs — usually don't have that. The lab director is also the QA manager is also probably running samples on Tuesday afternoons.

The documentation burden doesn't go away. ISO 15189 assessors don't grade on a curve for small labs. What does go away, with the right tooling, is the part where you're building this infrastructure by hand in spreadsheets or trying to retrofit a generic HR system to track method-specific competency assessments.

Personnel Pack is built specifically for labs that need the documentation to be auditor-ready without requiring a dedicated QA department to maintain it. The authorization record, the competency assessment, the assessor, the method, the date, the outcome — all structured, all queryable, all exportable to a format a surveyor can actually read.

---

## One Thing I Noticed at COLA 2025

The most common finding I heard mentioned at COLA 2025 wasn't sample handling or QC failures. It was documentation gaps in personnel records — specifically, authorization records that existed but couldn't be connected back to the competency assessment that established them.

The labs had done the assessments. They had the records. The records just weren't linked in a way the assessor could follow quickly.

That made the Personnel Pack authorization-to-assessment linkage feel less like a nice-to-have and more like the actual point of the product.

If you're running a lab under ISO 15189 or working toward accreditation, and the personnel documentation side of your audit prep still lives in a folder of signed PDFs and a spreadsheet, I'd genuinely like your read on whether this addresses the actual pain.

---

**Personnel Pack v1.5 is available now.** [Request a demo →](/demo) to see the authorization workflow and competency assessment tracking in the context of your lab's method inventory.
