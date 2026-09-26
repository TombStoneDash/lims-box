---
title: "Why Good Labs Still Make Obvious Mistakes (and What Two Books Say About Fixing It)"
slug: "why-good-labs-make-obvious-mistakes"
description: "Most lab errors are not about missing knowledge. They are skipped steps and systems that are wired too tightly. Lessons from The Checklist Manifesto and Normal Accidents for small testing labs."
author: "LIMS BOX Team"
authorRole: "Lab Software Engineering"
publishedAt: "2026-09-26"
updatedAt: "2026-09-26"
category: "Lab Management"
tags: ["lab quality", "small lab", "checklists", "lab errors", "environmental testing", "lab management"]
readingTime: 6
featured: false
---

## The Mistake Everyone Knew How to Avoid

Ask any lab director about their worst audit finding and you will often hear the same story. The analyst knew the procedure. The SOP was current. The instrument was calibrated. And still, one step got skipped: a blank that was not run, a holding time that slipped, a result that went out before review.

Nobody lacked the knowledge. The knowledge just did not get applied that day.

Two books explain why this happens and what actually helps. Neither is about labs. Both describe labs almost perfectly.

## Ignorance vs. Ineptitude

In *The Checklist Manifesto*, surgeon Atul Gawande borrows a distinction from two philosophers. The first reason we fail is ignorance: nobody knows the fix yet. The second they call ineptitude, where, in Gawande's words, "the knowledge exists, yet we fail to apply it correctly."
(Atul Gawande, *The Checklist Manifesto*, Introduction)

Gawande's point is that as work gets more complex, the second kind of failure takes over:

The real work, he writes, is "making sure we apply the knowledge we have consistently and correctly."
(*The Checklist Manifesto*, Introduction)

That is a useful lens for a small lab. When something goes wrong, ask first: *did we not know, or did we know and not do it?* The fixes are different. Training fixes the first. A well-placed check fixes the second.

### What makes a check work

A few rules follow from Gawande's argument:

- **Keep it short.** The checklist should hold only the steps that are easy to skip *because* they seem too obvious to check.
- **Put it at the handoff that matters most.** Right before a result is released or a report goes to a client, not buried at the start of the day.
- **Do not rely on memory to trigger it.** If the check only happens when someone remembers it is needed, it will be skipped on exactly the day it matters.

In a lab, that usually means a short review gate before release: QC passed, holding time met, required blanks and duplicates present, reviewer different from the analyst.

## When the System Itself Causes the Error

Charles Perrow's *Normal Accidents* looks at failures in power plants, airplanes and chemical plants. His claim is uncomfortable: in some systems, accidents are not caused by anyone being careless. They come from how the system is built.

> "This interacting tendency is a characteristic of a system, not a part or an operator; we will call it the 'interactive complexity' of the system."
> (Charles Perrow, *Normal Accidents*, Introduction)

Add what he calls tight coupling, where one step feeds the next with no pause, and a small problem spreads before anyone can catch it.

A lab with a sample tracked across three spreadsheets, an instrument export and an emailed report is a small version of that. A typo in one sheet flows straight into the report. There is no point where the mismatch is forced into view.

### What Perrow suggests

- **Add slack where things are tightly coupled.** A pause point, like a required review before release, lets you stop a bad result without stopping the whole lab.
- **Be careful stacking safeguards.** Every new form, log or alert is one more part that can fail in a new way. Fewer, better checks beat many overlapping ones.
- **The reviewer should not share the analyst's blind spot.** If the same person, or the same spreadsheet formula, produces and checks a result, the check is weaker than it looks.

## What This Means for Choosing Lab Software

Put the two books together and you get a simple test for any LIMS, including ours:

1. **Does it put the check at the release step**, so a result cannot go out until the required QC and review are recorded?
2. **Does it reduce hand-copying between systems**, so one typo cannot quietly flow into a report?
3. **Does it keep review separate from entry**, so the person who ran the sample is not the only one who signs off?
4. **Is it simple enough that people actually use it**, instead of working around it in a side spreadsheet?

Good software does not make a lab careful. It makes the obvious steps hard to skip and the mistakes easy to see. That is most of the job.

---

*Quotes are from Atul Gawande, The Checklist Manifesto (2009), Introduction, and Charles Perrow, Normal Accidents: Living with High-Risk Technologies (Princeton University Press, 1984/1999), Introduction.*
