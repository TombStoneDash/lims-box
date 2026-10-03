import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildPilotAuditIntegrityView, createPilotAuditIntegrityFixtures, DEMO_CURRENT_AT } from '../../lib/ohworks-demo-audit-integrity-view';
import { verifyAuditTrail, hashAuditEntry, GENESIS_PREVIOUS_HASH, explainAuditTrailReason, explainAuditTrailNextAction } from '../../lib/ohworks-audit-trail';
import { evaluateRecordRetention, createRecordPurgeManifest, RecordRetentionError, explainRecordRetentionError } from '../../lib/ohworks-record-retention';

test('fabricated intact chain and three mutations reproduce real verification and first failure', () => {
  const fixtures = createPilotAuditIntegrityFixtures();
  const view = buildPilotAuditIntegrityView();
  const failures = [undefined,
    { entryIndex: 3, code: 'previous-hash-mismatch' },
    { entryIndex: 2, code: 'sequence-gap' },
    { entryIndex: 2, code: 'action-not-permitted-for-role' },
  ];
  assert.equal(fixtures.chains.length, 4);
  fixtures.chains.forEach((fixture, index) => {
    const result = verifyAuditTrail(fixture.entries);
    const row = view.chains[index];
    assert.equal(row.label, fixture.label);
    assert.equal(result.status, index === 0 ? 'VERIFIED' : 'BROKEN');
    assert.equal(result.entryCount, 6);
    assert.deepEqual(result.failure, failures[index]);
    assert.equal(row.status, result.status);
    assert.equal(row.entryCount, result.entryCount);
    assert.deepEqual(row.failure, result.failure);
    assert.equal(row.finalHashPreview, result.finalHash?.slice(0, 12) ?? null);
    assert.equal(row.reason, result.failure ? explainAuditTrailReason(result.failure.code) : null);
    assert.equal(row.nextAction, result.failure ? explainAuditTrailNextAction(result.failure.code) : null);
  });
  const intact = fixtures.chains[0].entries;
  assert.equal(intact[0].previousHash, GENESIS_PREVIOUS_HASH);
  intact.slice(1).forEach((entry, index) => assert.equal(entry.previousHash, hashAuditEntry(intact[index])));
  assert.equal(view.chains[0].finalHash, hashAuditEntry(intact[5]));
  for (const fixture of fixtures.chains.slice(1)) {
    assert.deepEqual(fixture.entries.map((entry) => entry.previousHash), intact.map((entry) => entry.previousHash));
  }
});

test('five records use real retention decisions, dates and whole-day values', () => {
  const fixtures = createPilotAuditIntegrityFixtures();
  const view = buildPilotAuditIntegrityView();
  assert.equal(view.currentAt, DEMO_CURRENT_AT);
  assert.equal(view.records.length, 5);
  assert.ok(new Set(view.records.map((record) => record.recordClass)).size >= 3);
  assert.deepEqual(view.records.map((record) => record.evaluation.status), ['retain', 'eligible_for_purge', 'held', 'eligible_for_purge', 'retain']);
  assert.deepEqual(view.records.map((record) => record.wholeDays), [19, 5, 5, 3, 29]);
  fixtures.records.forEach((fixture, index) => {
    const row = view.records[index];
    const result = evaluateRecordRetention(fixture.profile, fixture.creationDate, DEMO_CURRENT_AT);
    assert.deepEqual(row.evaluation, result);
    assert.equal(row.recordId, fixture.recordId);
    assert.equal(row.recordClass, fixture.profile.recordClass);
    const delta = Date.parse(result.retentionEndDate) - Date.parse(DEMO_CURRENT_AT);
    assert.equal(row.wholeDays, Math.floor(Math.abs(delta) / 86_400_000));
    assert.equal(row.dayDirection, delta > 0 ? 'remaining' : 'past retention end');
  });
  assert.deepEqual(view.counts, { brokenChains: 3, recordsEligible: 2, recordsHeld: 1 });
});

test('manifest preview contains exactly eligible ids; adding the held record refuses the entire batch', () => {
  const fixtures = createPilotAuditIntegrityFixtures();
  const before = structuredClone(fixtures);
  const view = buildPilotAuditIntegrityView();
  const eligible = fixtures.records.filter((record) => evaluateRecordRetention(record.profile, record.creationDate, DEMO_CURRENT_AT).status === 'eligible_for_purge');
  assert.deepEqual(view.manifestPreview, createRecordPurgeManifest(eligible, DEMO_CURRENT_AT));
  assert.deepEqual(view.manifestPreview.recordIds, ['SYNTHETIC-REC-002', 'SYNTHETIC-REC-004']);
  assert.equal(view.purgeAttempts.length, 2);
  assert.equal(view.purgeAttempts[0].status, 'preview');
  assert.equal(view.purgeAttempts[0].code, null);
  assert.deepEqual(view.purgeAttempts[0].recordIds, view.manifestPreview.recordIds);
  const held = fixtures.records.filter((record) => evaluateRecordRetention(record.profile, record.creationDate, DEMO_CURRENT_AT).status === 'held');
  const refused = view.purgeAttempts[1];
  assert.equal(refused.status, 'refused');
  assert.deepEqual(refused.recordIds, [...eligible, ...held].map((record) => record.recordId));
  assert.throws(() => createRecordPurgeManifest([...eligible, ...held], DEMO_CURRENT_AT), (error: unknown) => {
    assert.ok(error instanceof RecordRetentionError);
    assert.equal(error.code, 'purge-under-litigation-hold');
    assert.equal(refused.code, error.code);
    assert.equal(refused.explanation, explainRecordRetentionError(error.code));
    return true;
  });
  assert.deepEqual(fixtures, before);
});

test('identifiers are synthetic; builders are deterministic and isolated from caller mutation', () => {
  const fixtures = createPilotAuditIntegrityFixtures();
  const view = buildPilotAuditIntegrityView();
  for (const id of [...fixtures.records.map((record) => record.recordId), ...view.records.map((record) => record.recordId), ...view.purgeAttempts.flatMap((attempt) => attempt.recordIds)]) {
    assert.match(id, /^SYNTHETIC-REC-\d{3}$/);
  }
  assert.deepEqual(view, buildPilotAuditIntegrityView());
  assert.deepEqual(fixtures, createPilotAuditIntegrityFixtures());
  fixtures.chains[0].entries[0].sequence = 99;
  fixtures.records[0].profile.litigationHold = true;
  assert.deepEqual(view, buildPilotAuditIntegrityView());
  const source = readFileSync(new URL('../../lib/ohworks-demo-audit-integrity-view.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)|process\.env|fetch\s*\(/);
});

test('one read-only section follows quality events and immediately precedes the real-data stop', () => {
  const source = readFileSync(new URL('../../app/pilot/ohworks/audit/page.tsx', import.meta.url), 'utf8');
  const title = 'Audit-chain integrity and record retention (fabricated)';
  assert.equal(source.split(title).length - 1, 1);
  assert.ok(source.indexOf(title) > source.indexOf('Quality events (fabricated)'));
  const panelEnd = source.indexOf('</section>', source.indexOf(title));
  const nextEnd = source.indexOf('</section>', panelEnd + 10);
  assert.match(source.slice(panelEnd, nextEnd), /Real-data stop/);
  const panel = source.slice(source.indexOf(title), panelEnd);
  assert.equal((panel.match(/<h3\b/g) ?? []).length, 2);
  assert.match(panel, /not regulatory guidance/);
  assert.match(panel, /NOTHING is purged or deleted/);
  assert.doesNotMatch(panel, /role\./);
  assert.match(source, /const auditIntegrity = buildPilotAuditIntegrityView\(\)/);
  assert.doesNotMatch(source, /use client|<form\b|fetch\s*\(|verifyAuditTrail\(|evaluateRecordRetention\(|createRecordPurgeManifest\(/);
});
