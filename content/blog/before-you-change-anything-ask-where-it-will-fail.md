---
title: "Before You Change Anything in the Lab, Ask Where It Will Fail"
slug: "before-you-change-anything-ask-where-it-will-fail"
description: "A new method, instrument or piece of software is a chance to improve, and a chance to break something. Charlie Munger's habit of inversion gives lab managers a simple way to plan changes that don't backfire."
author: "LIMS BOX Team"
authorRole: "Lab Software Engineering"
publishedAt: "2026-09-26"
updatedAt: "2026-09-26"
category: "Lab Management"
tags: ["lab management", "change management", "small lab", "decision making", "lab quality"]
readingTime: 5
featured: false
---

## The Change That Looked Like an Upgrade

Most lab problems do not come from bad ideas. They come from good ideas rolled out without asking what could go wrong. A faster method that nobody validated on the lab's own samples. A new instrument that exports results in a slightly different format. A software switch that quietly dropped a field someone relied on.

Each change was meant to help. The trouble was in the parts nobody thought about.

A book about investors Warren Buffett and Charlie Munger offers a simple habit for avoiding this.

## Where Am I Going to Die?

Peter Bevelin's book about Buffett and Munger takes its title from a line attributed to a farmer and quoted by Munger:

> "All I want to know is where I'm going to die so I'll never go there."
> (Peter Bevelin, *All I Want to Know Is Where I'm Going to Die So I'll Never Go There*, 2016, title line)

The idea is called inversion. Instead of asking only "how do we make this work?", you also ask "how would this fail?", and then you steer away from those paths.

The book sums up the lesson this way:

> "The major lesson is 'ignorance removal'... decision-making is not about making brilliant decisions, but avoiding terrible ones."
> (Bevelin, front matter)

## Why This Fits Labs So Well

Labs are full of changes: new methods, new analysts, new instruments, new software, new clients with new requirements. Each one can improve the lab. Each one can also introduce a problem that stays hidden until an audit, a complaint or a rerun reveals it.

Munger's own summary of the approach, quoted in the book, is worth keeping in mind:

> "It is remarkable how much long-term advantage people like us have gotten by trying to be consistently not stupid, instead of trying to be very intelligent."
> (Charlie Munger, quoted in Bevelin, Introduction)

For a lab, "consistently not stupid" means that a change never breaks something that already worked.

## A Simple Inversion Exercise

Before your next significant change, get the people who will live with it in a room for twenty minutes and work through these questions.

**1. Imagine it went badly. What happened?**
Picture the change six months from now as a failure. List every way that could have happened. Missed samples, wrong units, a lost audit trail, an unhappy client, retraining that never stuck.

**2. Which of those have happened here before?**
Your lab's own history is the best guide. If a past software change lost data, or a past method change caused reruns, those are the first failure paths to block.

**3. What would catch each failure early?**
For each item on the list, name the check that would spot it: a parallel run, a comparison of old and new results, a review of the first batch, a sign-off before the old process is retired.

**4. What is the simplest version of the change?**
Bevelin's book prizes simplicity. A change with fewer moving parts has fewer ways to fail. Roll out the smallest useful step first.

**5. How will you undo it?**
Know how you would go back if the change causes trouble. A change you cannot reverse deserves more checks before it goes live.

## Short Mistakes, Not Zero Mistakes

No lab gets every change right. The goal of inversion is not perfection. It is to avoid the big, predictable failures, and to notice and fix the small ones quickly instead of letting them run.

When you choose new software, including ours, run the same exercise. Ask the vendor how migrations fail, how you would get your data back, and what you would lose if you needed to go back.

---

*Quotes are from Peter Bevelin, All I Want to Know Is Where I'm Going to Die So I'll Never Go There (2016), a study of Buffett and Munger: the title line, the front matter and the Introduction.*
