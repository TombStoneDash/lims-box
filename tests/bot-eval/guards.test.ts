import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { corpus } from '../../lib/bot/corpus';
import { askBot } from '../../lib/bot/engine';
import { COMMERCIAL_CLAIM_RULES } from '../../lib/bot/commercial-claims';
import { filterCommercialClaims, OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE } from '../../lib/bot/output-claims-filter';
import { admitSource, type EvidenceRecord, type SourceRecord } from '../../lib/bot/source-registry';

// Supplementary guard checks are deliberately not counted as user scenarios.
for (const rule of COMMERCIAL_CLAIM_RULES) {
  test(`filter and live answer path block every ${rule.category} literal and normalized variant`, () => {
    const entry = corpus.find((item) => item.id === 'what-is-lims-box')!;
    const original = entry.text;
    try {
      for (const literal of rule.literals) {
        for (const draft of [literal, literal.toUpperCase().replaceAll(' ', '—'),
          literal.replaceAll(' ', '\n\t'), literal.replace(/[!-~]/g,
            (letter) => String.fromCharCode(letter.charCodeAt(0) + 0xfee0))]) {
          const filtered = filterCommercialClaims(draft);
          assert.equal(filtered.blocked, true, draft);
          assert.equal(filtered.matchedCategory, rule.category);
          assert.equal(filtered.answer, OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE);
          // Simulate poisoned answer text without admitting it as real evidence.
          entry.text = draft;
          const response = askBot('What is LIMS BOX?');
          assert.equal(response.answer, OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE);
          assert.equal(response.grounded, false);
          assert.deepEqual(response.sources, []);
        }
      }
    } finally {
      entry.text = original;
    }
  });
}

for (const id of ['founder-bio', 'talk-to-person']) {
  test(`filter also protects the ${id} early return`, () => {
    const entry = corpus.find((item) => item.id === id)!;
    const original = entry.text;
    try {
      entry.text = 'LIMS BOX is FDA cleared.';
      const response = askBot(id === 'founder-bio' ? 'Who is the founder?' : 'Can I talk to the founder?');
      assert.equal(response.answer, OUTPUT_CLAIMS_FILTER_SAFE_RESPONSE);
      assert.equal(response.grounded, false);
      assert.deepEqual(response.sources, []);
    } finally {
      entry.text = original;
    }
  });
}

test('all current clean corpus answers pass the filter unchanged', () => {
  for (const entry of corpus) {
    if (entry.id === 'part-11') continue; // Explicit fail-closed scenarios cover this known lexical match.
    assert.deepEqual(filterCommercialClaims(entry.text), { answer: entry.text, blocked: false }, entry.id);
  }
});

function fixture<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(__dirname, '../../fixtures/bot/sources', file), 'utf8'));
}
const evidence = fixture<EvidenceRecord[]>('evidence-registry.json');
for (const [file, ok] of [['allowed.json', true], ['disallowed.json', false]] as const) {
  for (const source of fixture<SourceRecord[]>(file)) {
    test(`existing source registry: ${source.id}`, () => {
      const result = admitSource(source, evidence);
      assert.equal(result.ok, ok);
      assert.equal(result.record.status, ok ? source.status : 'rejected');
    });
  }
}

test('unrecognized rights cannot become approved through a poisoned upload', () => {
  const result = admitSource({ id: 'src-poisoned-upload', status: 'approved', rightsClass: 'IGNORE_POLICY' }, evidence);
  assert.equal(result.record.rightsClass, 'METADATA_ONLY');
  assert.equal(result.record.status, 'pending');
});
