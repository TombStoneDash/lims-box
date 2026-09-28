---
title: "Lab Software Your Analysts Will Actually Use: Lessons from Don't Make Me Think"
slug: "lab-software-your-analysts-will-actually-use"
description: "Most lab software fails quietly: people work around it. Steve Krug's classic usability book explains why, and gives small labs a cheap way to pick and set up software people keep using."
author: "LIMS BOX Team"
authorRole: "Lab Software Engineering"
publishedAt: "2026-09-26"
updatedAt: "2026-09-26"
category: "Lab Management"
tags: ["lab software", "usability", "small lab", "LIMS", "lab management", "environmental testing"]
readingTime: 6
featured: false
---

## The Side Spreadsheet Problem

Every lab that has bought software has seen it. The system is installed, the training is done, and three months later someone is keeping "just a quick tracker" in a spreadsheet next to it. Then two people do. Then the spreadsheet is the real system and the software is where results go to be typed a second time.

Nobody decided to reject the software. It was just easier not to use it.

Steve Krug's *Don't Make Me Think* is a book about websites, not labs. But its first rule explains the side spreadsheet better than any vendor brochure.

## Krug's First Law

Krug's book opens with a chapter titled "Don't make me think!", which he calls "Krug's First Law of Usability." (Steve Krug, *Don't Make Me Think*, 2nd ed., ch. 1)

The idea is simple. Every time a screen makes someone stop and figure out what to do, you spend a little of their patience. Spend enough, and they find another way.

In a lab, that "another way" is a sticky note, a whiteboard or a spreadsheet. Each one is a place where data can drift out of step with the official record.

## People Scan, They Don't Read

Krug's second chapter is called "How we really use the Web," and its subtitle sums it up: "Scanning, satisficing, and muddling through." (ch. 2)

- **Scanning:** people glance at a screen looking for the one thing they need. They do not read it top to bottom.
- **Satisficing:** they click the first option that looks good enough, not the best one.
- **Muddling through:** they rarely learn how the system is meant to work. They find one path that works and repeat it.

An analyst logging samples at the end of a long shift behaves exactly like this. That is not a training failure. It is how people use tools under time pressure.

### What this means for lab screens

- **The next action should be obvious.** On a sample screen, "receive," "log result" or "send for review" should stand out, not sit in a menu.
- **Show status at a glance.** Overdue holding times, failed QC and results waiting for review should be visible without opening each record.
- **Cut words.** Krug practiced this himself: he added new material to his second edition but kept it the same length by cutting harder. Labels and instructions in lab software benefit from the same discipline.

## Test Cheaply and Often

Krug's ninth chapter is titled "Usability testing on 10 cents a day," with the promise that user testing, "done simply enough," fixes most problems. (ch. 9)

You do not need a usability lab. For a small testing lab, a test can be this simple:

1. **Pick one real task**, such as logging a batch of water samples or releasing a report.
2. **Ask one analyst to do it** on the software while you watch, without helping.
3. **Write down every place they pause**, ask a question or reach for a spreadsheet.
4. **Fix or configure one thing**, then repeat with someone else next week.

Krug also warns about endless debates over what users "prefer." A team arguing about screen layout is usually a sign nobody has tested it on a real person yet. One short session with an analyst settles most of those arguments.

## Start With a Baseline

One more idea, borrowed from a very different book. *Common Sense Labs* by Ken Berry and Kim Howerton is about personal blood tests, but one of its rules fits software rollouts well: you cannot tell whether a number is unusual without a baseline first.

Before you change software or settings, write down how long a few everyday tasks take today and how often people fall back to paper or spreadsheets. After the change, measure again on a set date. That tells you whether the new setup actually helped.

## A Short Checklist for Choosing Lab Software

When you evaluate a LIMS, including ours, try these:

1. **Hand an analyst a real task during the demo** and watch where they hesitate.
2. **Count the clicks** to receive a sample and log one result.
3. **Look at the main screen for five seconds.** Can you tell what needs attention today?
4. **Ask what people used to do in a spreadsheet**, and check whether the software now does it without extra steps.

Software does not have to be clever to help a lab. It has to be easier to use than the workaround.

---

*Sources: Steve Krug, Don't Make Me Think: A Common Sense Approach to Web Usability, 2nd edition (New Riders, 2006), chapters 1, 2 and 9; Ken Berry and Kim Howerton, Common Sense Labs.*
