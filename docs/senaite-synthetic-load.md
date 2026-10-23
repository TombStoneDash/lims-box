# Loading the 60 synthetic OHWorks samples into SENAITE

Point 3 of Hudson's ten-point OHWorks/SENAITE ask: "load 60 synthetic samples". `lib/senaite-synthetic-load` takes the batch from `generateOHWorksSyntheticSamples` (`lib/ohworks-synthetic-sample-batch`) and creates each sample in SENAITE through the sample-create contract (`lib/ohworks-senaite-create`) and the SENAITE create adapter (`lib/senaite-sample-create`, PR #785). Nothing calls it yet: there's no route, page, job or script.

```ts
const adapter = createSenaiteSampleCreateAdapter(mapping); // needs SENAITE_SAMPLE_CREATE_TOKEN
const result = await loadSyntheticSamplesIntoSenaite(samples, { tenantId: 'SYNTHETIC-TENANT-001' }, adapter);
```

## What it guarantees

- **Synthetic only.** Before the first request it refuses (`SyntheticLoadInputError`) any batch where a request, tenant, client or sample ID isn't `SYNTHETIC-…`, an analysis isn't `SYNTHETIC-ANALYSIS-<digits>`, the tenant isn't the context tenant, an ID repeats, or the batch is empty or over 100.
- **Loaded means read back.** A sample counts as `CREATED` only when the adapter has read it back from SENAITE under the right client, ID, sample type and analyses. `status: 'loaded'` means all of them were.
- **Re-running is safe.** The adapter finds an earlier attempt by `ClientSampleID`, so a second run finishes what's missing and creates no duplicates. A lost create answer is reported (`adapterCode: 'write-unconfirmed'`), and the next run settles it.
- **It stops when the run is wrong.** `not-configured`, `unauthenticated`, `scope-mismatch`, `invalid-response` or `request-failed` from the adapter halts the batch. So do three per-sample failures in a row. The rest are reported `SKIPPED`, and `haltedOn` names the sample and code.
- **One SENAITE sample per OHWorks sample.** If two OHWorks samples resolve to the same SENAITE ID, the second is `REJECTED` with `senaite-id-reused`.
- Results carry fixed codes only, never upstream text, URLs or credentials.

`targetState` from the generator isn't applied. Receiving (PR #786) and the later transitions are separate steps.

## Tests

`npm run test:senaite-synthetic-load` runs the real create adapter against the senaite.jsonapi stand-in: 60 → 60 samples with 15 per matrix, a re-run with no new POSTs, a lost answer plus a re-run, a rejected sign-in, a missing `getClientSampleID` index, repeated refusals, an isolated refusal, SENAITE ID reuse, non-synthetic input, and contract rejections.

## Not proven yet

It hasn't been run against a signed-in real SENAITE. That needs the setup from point 2 (PR #783) to exist on a synthetic-data server, plus a create-capable token.
