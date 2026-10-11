# PR 650 reviewer-of-record receipt

Result: PASS
Head: d0ff28e2499475e3c9f1d848ee76f18ca3a794f4
Base: 385f3e7b966ac4dd7ce1f8a1a12a00af68cbf3d7
GitHub connector verified the exact open draft PR head and base. Read entire one-file diff (6 insertions, 8 deletions), evaluator, tests, and consumer references. No actionable regression found.

Checkout was denied at external Git metadata index.lock. Tested exact git archive snapshots inside this repository instead. Head evaluator blob verified as f92390aca757b51049c4b7eb098ef317012f2a81.

Verification:
- git diff BASE HEAD --check: exit 0.
- node --import tsx --test tests/ohworks/linearity.test.ts: exit 1 on head and base; missing tsx.
- npm run test:all: exit 1 on head and base; all 365 discovered files blocked by missing tsx before tests loaded.
- Node v24.14.1 native TypeScript with an in-memory extensionless .ts resolution hook: 47/47 existing linearity and demo-method-performance-view tests passed, exit 0.
- Five independent synthetic intercept checks: exit 0. Offsets +/-5e-10 correctly fail with +/-1e-10 limits on head (incorrectly pass on base); +/-1e-10 and zero pass on both.

Native test reproduction in an exact head archive:
node --input-type=module -e 'import {registerHooks} from "node:module"; registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(s.startsWith("."))return n(s+".ts",c);throw e}}}); await import("./tests/ohworks/linearity.test.ts"); await import("./tests/ohworks/demo-method-performance-view.test.ts");'

Only local review artifacts were written. No tracked code edits, commit, push, merge, or PR comment. Exact archive scratch copies removed after testing; logs retained beside this receipt. Full dependency-backed suite remains unverified; missing dependencies are excluded from FAIL by the requested review rules.
