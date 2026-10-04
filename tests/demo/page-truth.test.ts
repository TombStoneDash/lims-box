import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const demo = readFileSync(new URL('../../app/demo/page.tsx', import.meta.url), 'utf8');
const recording = readFileSync(new URL('../../app/demo/record/page.tsx', import.meta.url), 'utf8');

test('custody confirmation describes the click-to-sign preview and its limits', () => {
  assert.ok(demo.includes('Demo signature shown.'));
  assert.ok(demo.includes('This click-to-sign preview uses synthetic custody records.'));
  assert.ok(demo.includes('It does not lock the transfer chain or create a validated electronic signature.'));
  assert.doesNotMatch(demo, /The full transfer chain is locked|signature captured with timestamp and IP/i);
});

test('web demo footer requires internet instead of promising offline operation', () => {
  assert.ok(demo.includes('>Web Demo</p>'));
  assert.ok(demo.includes('Internet connection required'));
  assert.doesNotMatch(demo, /Offline-Capable|No internet needed/i);
});

test('recorded report describes synthetic data without compliance or timing promises', () => {
  assert.ok(recording.includes('Synthetic report preview with example results and QC data.'));
  assert.ok(recording.includes('This demonstration does not establish regulatory compliance or report generation time.'));
  assert.ok(recording.includes("overlay: 'Synthetic report preview.'"));
  assert.doesNotMatch(recording, /EPA-compliant|12 seconds|All QC data auto-included|Ready in minutes/i);
});
