import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

// Issue #789: one accurate LabLogs comparison line on the Personnel Pack page.
// It may only repeat what LabLogs' own site lists (equipment maintenance, QC,
// lots, reagents) and must not claim anything LabLogs lacks, which is unverified.
const page = readFileSync(path.join(__dirname, '..', '..', 'app/personnel-pack/page.tsx'), 'utf8');

function comparisonLine(): string {
  const match = /data-testid="lablogs-comparison"[^>]*>([\s\S]*?)<\/p>/.exec(page);
  assert.ok(match, 'the Personnel Pack page has exactly one LabLogs comparison line');
  return match[1].replace(/\s+/g, ' ').trim();
}

test('the Personnel Pack page names LabLogs once, in the comparison line', () => {
  assert.equal(page.match(/LabLogs/g)?.length, 2, 'the line plus its source comment');
  assert.match(comparisonLine(), /LabLogs track maintenance, QC records, lots and reagents\./);
  assert.match(comparisonLine(), /Personnel Pack covers the people side: competency, training and authorizations\./);
});

test('the comparison line makes no unverified claim about what LabLogs lacks', () => {
  const line = comparisonLine();
  assert.doesNotMatch(line, /\b(?:not|no|never|lacks?|without|doesn't|does not|can't|cannot|only|offline|cloud)\b/i);
  assert.doesNotMatch(line, /\b(?:better|best|unlike|instead|replace)\b/i);
});
