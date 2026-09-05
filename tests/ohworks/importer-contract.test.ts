import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { classifyReplay, resultFingerprint } from '../../lib/ohworks-senaite/importer-contract';
import { RESULT_IMPORTER_RELATIVE_PATH, RESULT_IMPORT_POSTCONDITION, RESULT_IMPORT_TRANSITION, SENAITE_SOURCE_HEAD, assertImporterContract } from '../../lib/ohworks-senaite/provenance';

test('existing importer contract remains submit then awaiting verification', () => {
  assert.equal(SENAITE_SOURCE_HEAD, 'bcc97cc5df73941c3e34171e67a64b552e13425e');
  assert.equal(RESULT_IMPORTER_RELATIVE_PATH, 'tools/import-results.js');
  assert.doesNotThrow(() => assertImporterContract(RESULT_IMPORT_TRANSITION, RESULT_IMPORT_POSTCONDITION));
  assert.throws(() => assertImporterContract('verify', RESULT_IMPORT_POSTCONDITION));
});

test('exact replay is unchanged and conflicting source-record replay is quarantined', () => {
  const original = resultFingerprint('AR-001', 'confirmed-keyword', 'observed-value', 'confirmed-unit');
  const changed = resultFingerprint('AR-001', 'confirmed-keyword', 'different-value', 'confirmed-unit');
  const ledger = { sourceRecordId: 'source-record-001', newValueFingerprint: original };
  assert.equal(classifyReplay(undefined, 'source-record-001', original), 'new');
  assert.equal(classifyReplay(ledger, 'source-record-001', original), 'unchanged');
  assert.equal(classifyReplay(ledger, 'source-record-001', changed), 'quarantined');
});

test('customer action route cannot write instrument results', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../app/pilot/ohworks/api/actions/route.ts'), 'utf8');
  assert.doesNotMatch(source, /record_result|Result\s*:/);
});
