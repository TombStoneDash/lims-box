import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { GENERATED_PACK_KEY, PDF_SOURCE_SHA256, generatePersonnelPackPdf } from '../../lib/personnel-pack/pdf';

// Golden for the auto-PDF renderer (F2). If a deliberate template or layout change
// moves these values, bump the renderer revision in lib/personnel-pack/pdf.ts and
// update both constants in the same PR so reviewers see the change.
const GOLDEN_SOURCE_SHA256 = '5d48f88823a55ba96426ae9b0a9338dd0483c51222cc45c2a73317816eee54ee';
const GOLDEN_PDF_SHA256 = '168dabca0ea04bb3cab2e0ee11036fdb93c83c09e29341dca02c631978fcf230';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('auto-PDF renderer is byte-stable across runs', async () => {
  const first = await generatePersonnelPackPdf();
  const second = await generatePersonnelPackPdf();
  assert.equal(first.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.equal(sha256(first), sha256(second));
});

test('auto-PDF output matches the reviewed golden', async () => {
  assert.equal(PDF_SOURCE_SHA256, GOLDEN_SOURCE_SHA256);
  assert.equal(GENERATED_PACK_KEY, `iso15189-generated-${GOLDEN_SOURCE_SHA256}`);
  assert.equal(sha256(await generatePersonnelPackPdf()), GOLDEN_PDF_SHA256);
});
