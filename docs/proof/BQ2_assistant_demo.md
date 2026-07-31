# BQ2 Grounded Assistant Demo Proof

**Verified:** 2026-07-26

**Dependency:** BQ1 commit `c646c96bac1e1b94ec0618e4e563816a7e222619`

**Route:** `/demo/assistant`

## Five canonical grounded answers

1. Status
   - Question: `What is the status of SYN-26041-0001?`
   - Answer: `SYN-26041-0001 is in progress in this fabricated demo dataset.`
   - Source: synthetic sample record.
2. Results
   - Question: `What results are available for SYN-26041-0001?`
   - Answer: reports the three fabricated values with units and flags.
   - Sources: synthetic sample and result records.
3. Turnaround
   - Question: `What is the TAT for SYN-26041-0001?`
   - Answer: expected report at `2026-02-02T20:00:00.000Z`, based on the longest configured synthetic turnaround of 36 hours.
   - Sources: synthetic sample and ordered test-catalog records.
4. Container
   - Question: `What container does CHEM-ALT require for serum?`
   - Answer: `1 × SST`.
   - Source: synthetic test catalog.
5. How to order
   - Question: `How do I order CHEM-ALT for SYN-26041-0001?`
   - Answer: describes the sample, test, matrix, and container check, then states that the assistant does not create or modify orders.
   - Sources: synthetic sample and test catalog.

## Refusal proof

- PHI request: refused; states that the demo has no PHI.
- Result interpretation: refused; reports values and flags only.
- Compliance attestation: refused; requires human-controlled, customer-specific evidence.
- Prompt injection: refused; does not reveal or bypass guardrails.
- Unknown synthetic sample: returns evidence missing and no source citation.
- General product, pricing, contact, and compliance questions: return the
  synthetic-only scope refusal with no source citation. The demo never falls
  through to the live website assistant corpus.

## Automated proof

```text
npm run test:synthetic
tests 4
pass 4
fail 0

npm run test:bot
tests 25
pass 25
fail 0

npm run typecheck
PASS

npm run build
PASS
```

The production build contains:

- `/demo/assistant`
- `/api/demo/assistant`

`git diff --check` passes.

## Independent review repair

Sonnet 5 Max independently reproduced a scope escape in the first BQ2 commit:
unrecognized demo questions fell through to the general website assistant and
could return live pricing, contact, and compliance copy. The fallback was
removed. A regression test now covers the exact five probes from that review,
and all return the synthetic-only refusal without citations or live copy.

## Browser proof

- `GET /demo/assistant`: HTTP 200.
- Status suggestion returned the grounded status and rendered a link to the synthetic sample source.
- A typed patient-name request returned the no-PHI refusal in the page.
- The page was visually inspected at desktop width; the five suggestion buttons, conversation, source panel, input, and three source cards rendered without overlap or clipping.

No production route, production corpus, database, credential, send, deployment,
or merge was used.
