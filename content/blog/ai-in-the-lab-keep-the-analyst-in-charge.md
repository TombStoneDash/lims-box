---
title: "AI in the Lab Should Keep the Analyst in Charge"
slug: "ai-in-the-lab-keep-the-analyst-in-charge"
description: "AI features are showing up in lab software. Ben Shneiderman's Human-Centered AI argues you should not have to trade control for automation. Here is a practical way for small labs to judge any AI feature."
author: "LIMS BOX Team"
authorRole: "Lab Software Engineering"
publishedAt: "2026-09-26"
updatedAt: "2026-09-26"
category: "Lab Management"
tags: ["AI", "lab software", "human oversight", "audit trail", "small lab", "lab management"]
readingTime: 6
featured: false
---

## The Question Behind Every AI Feature

Lab software vendors are adding AI everywhere: suggested result flags, auto-filled sample details, drafted report summaries. Some of it is genuinely useful. Some of it quietly moves decisions away from the people who are accountable for them.

The usual way to think about this is a dial. Turn it one way and the software does more on its own. Turn it the other way and people stay in control. You pick a point somewhere in the middle.

Ben Shneiderman, a computer scientist who has spent decades studying how people work with software, thinks that dial is the wrong picture.

## Control and Automation Are Not Opposites

In the preface to *Human-Centered AI*, Shneiderman sets out his central question: how it is possible "to have high levels of human control and high levels of automation" at the same time. (Ben Shneiderman, *Human-Centered AI*, Oxford University Press, 2022, Preface)

His point is that good tools do both. They take on a lot of the work, and they still leave a person clearly in charge of the result. Think of a well-designed instrument: it runs the method automatically, but the analyst still reviews the data and decides whether it is reported.

For a lab, that is a useful standard. An AI feature should make an analyst faster and more thorough. It should not make the decision for them where nobody can see it.

## Three Layers of Trust

Shneiderman organizes his book around three layers:

> "Reliable systems based on sound software engineering practices... Safety culture through business management strategies... Trustworthy certification by independent oversight."
> (*Human-Centered AI*, Preface)

Each one maps onto how a lab already works.

### 1. Reliable systems: keep an audit trail

On the engineering side, Shneiderman calls for "audit trails to enable analysis of failures, just like the flight data recorders... that have made civil aviation such a success story." (Preface)

Labs understand this better than most industries. Every result already needs a history: who ran it, on which instrument, with which calibration. AI output deserves the same treatment. If software suggested a flag or filled in a value, the record should show that it did, what it suggested, and who accepted or changed it.

### 2. Safety culture: review the near-misses

The second layer is about management, not code. The habit that matters is looking at problems before they become findings. When an AI suggestion was wrong but caught in review, that is a near-miss worth a minute in the weekly meeting, not something to shrug off.

### 3. Independent oversight: the reviewer is not the builder

The third layer is independent review. In a lab, the principle is familiar: the person who reviews a result should not be the same person, or the same automated step, that produced it. An AI that both drafts a result and marks it as checked is doing both jobs at once.

## A Short Checklist for Any AI Feature

When a vendor, including us, shows you an AI feature, ask:

1. **Can the analyst see what it did?** Every AI suggestion should be visible as a suggestion, not blended silently into the record.
2. **Can the analyst override it easily?** Accepting and rejecting should both take one click, and rejecting should not be buried.
3. **Is there an audit trail?** The record should show what the AI proposed and who made the final call.
4. **Is review still independent?** A person other than the one who ran the sample, and not the AI itself, should approve release.
5. **What happens when it is wrong?** Ask for an example of a bad suggestion and how the software makes it easy to catch.

If a feature passes those five, it is probably helping. If it fails the first two, it is taking decisions away from the people who sign the reports.

## The Bottom Line

The goal is not less AI or more AI. It is software that does more of the busywork while making it even clearer who decided what. That is how a lab gets faster without getting less trustworthy.

---

*Quotes are from Ben Shneiderman, Human-Centered AI (Oxford University Press, 2022), Preface.*
