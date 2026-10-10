# Six verified LIMS BOX jobs

Verified on `51c6ba887bc4d0af0786e646dbdfa98817cb9897`, branch
`codex/plan-hud-lims-box-20261010-r2`, host `MAIN-DAISY.local`.
Planning only: no product code or existing tests changed, no commit, push,
external message, deployment, or live SENAITE operation.

## Proposed jobs

Each packet owns exactly one existing source and one proposed test file in
the existing Python voice lane. New test files are implementation targets;
they were not added by this planner. All six affect the documented
`python -m voice` user flow.

| Job | User-visible defect and evidence | Source file | Test file to add |
| --- | --- | --- | --- |
| 01 | Rejected result writes announced as recorded, line 178 | `voice/commands.py` | `tests/voice/test_record_result_confirmation.py` |
| 02 | Rejected submission announced as complete; current sample cleared, lines 202–205 | `voice/commands.py` | `tests/voice/test_mark_complete_confirmation.py` |
| 03 | 30-sample backlog announced as 25; only first page fetched, lines 78–95 and 124–126 | `senaite/client.py` | `tests/voice/test_pending_samples_pagination.py` |
| 04 | Offline command replays against a later active sample, lines 201–202 and 268 | `voice/listener.py` | `tests/voice/test_offline_target_context.py` |
| 05 | Refused replay deleted and counted as processed, lines 145–156 | `voice/queue.py` | `tests/voice/test_queue_failure_retention.py` |
| 06 | Queued read results logged but never spoken, lines 145–158 | `voice/queue.py` | `tests/voice/test_queue_spoken_results.py` |

Full inputs, observations, implementation scope and acceptance criteria are
in `proposed-jobs/001-*.json` through `006-*.json`. Execute 01 before 02 and
05 before 06 because those pairs share source files. Do not dispatch competing
writers. Job 04 proposes refusing targetless offline mutations, including
legacy replay, to fit its one-file scope; durable target-bound replay would
be a broader design.

## Issue preference and duplicate exclusions

GitHub queries sorted by creation ascending returned these open issues:

- [#72](https://github.com/TombStoneDash/lims-box/issues/72): covered by open PR #538; exclude.
- [#94](https://github.com/TombStoneDash/lims-box/issues/94): recent merged PR #559 covers Personnel Pack verification work; exclude without claiming the entire production incident is resolved.
- [#95](https://github.com/TombStoneDash/lims-box/issues/95): provider OAuth operations audit, not a verified single-source product-code job.

Reviewed titles, bodies and all changed filenames for **17 open PRs** and
**32 PRs merged since 2026-10-09**. None touches the four selected source
paths. Open planning PR #535 proposes eight unrelated OHWorks jobs.
Local history also has no changes since the cutoff in `voice/` or `senaite/`.
The sanitized snapshot preserves PR numbers, titles, URLs and file lists.
The CLI could not reach api.github.com; the authenticated GitHub connector
supplied the successful checks. Its issue search is issue-only; the separate
PR search supplied PR exclusions. No provider credentials were inspected.

## Inspection and ownership

Read voice and OHWorks READMEs, the founder loader SPEC, SYSTEM_MAP and
full-suite testing docs, voice/SENAITE source and existing voice tests.
Inspected additional OHWorks evaluators; rejected unwired helper candidates
in favor of directly reachable behavior. The tracked-file inventory has no
root README, ROADMAP or TODO document. Repository-wide TODO/FIXME search
found no actionable markers, only a testing-doc mention of zero todo tests.
The founder SPEC describes implemented work, not a new missing feature.

The assigned branch was clean at entry and is the authorized planning lane.
No extra worker claim or production lease was created. Existing repository
receipts and test-layout documentation were inspected. This task does not
dispatch workers or mutate external queues. Receipt is staged in the existing
`docs/worker-results` layout for runner collection; no host-external receipt
destination was supplied for this sandbox.

## Verification

- `python3 -m unittest discover -s tests/voice -p 'test_*.py'`: exit 0, **106 passed**.
- `python3 docs/planning/2026-10-10-r2/reproduce.py`: exit 0, **6 defect witnesses passed**.
- Packet validation: six JSON packets, existing sources, unique Python test
  targets under `tests/voice`, no source overlap with excluded PRs.
- `git diff --check`: exit 0; tracked product diff remains empty.

Witnesses assert current incorrect behavior, not that fixes exist. They use
mocked API responses, synthetic sample IDs and in-memory SQLite: no network,
microphone, model download, live writes or email. The first two prove false
confirmation for explicit rejection responses; they do not claim a live
SENAITE server currently emits that envelope. Implementation must pin the
supported acknowledgment and pagination contracts in fixtures before claiming
successful persistence or completeness.

Recovery: remove newly added planning artifacts if withdrawn. Product
behavior is unchanged.
