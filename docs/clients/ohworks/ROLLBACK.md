# Rollback and recovery

## This local increment

The work is isolated on branch `codex/ohworks-client-pilot-20260902` in its own worktree. It does not alter the original checkout, a deployed environment, DNS, a database, or customer data.

Rollback is deletion of the isolated branch/worktree after preserving any desired receipt. Before merge, no production recovery procedure is required.

## Future pilot

A deployment rollback plan must name the last known-good artifact, schema compatibility, feature-flag or traffic-reversal mechanism, interface pause/drain behavior, message replay rules, data-reconciliation procedure, evidence owner, recovery objectives, and customer communication authority. It must be rehearsed before customer data is admitted.
