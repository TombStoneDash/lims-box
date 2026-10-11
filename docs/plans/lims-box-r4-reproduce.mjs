// Planning evidence: assert current defects, not desired repaired behavior.
// Synthetic inputs only; the sample adapter below is an in-memory stub.
import assert from 'node:assert/strict';
import { runWorksheetVerificationWorkflow } from '../../lib/ohworks-worksheet-verification.ts';
import { createOHWorksSenaiteSample } from '../../lib/ohworks-senaite-create.ts';
import { buildShiftHandoffChecklist } from '../../lib/ohworks-shift-handoff-checklist.ts';
import { diffResultVersions } from '../../lib/ohworks-result-diff.ts';
import { planReflexTests } from '../../lib/ohworks-reflex-rules.ts';

const context = { tenantId: 'SYNTHETIC-T', worksheetId: 'SYNTHETIC-W', worksheetType: 'routine_chemistry' };
const worksheet = runWorksheetVerificationWorkflow(context, [{
  ...context, eventId: 'SYNTHETIC-E', kind: 'prepare', actorRole: 'preparer',
  actorId: 'SYNTHETIC-A', occurredAt: '2026-02-30T12:00:00Z', preparationNotes: 'Synthetic preparation',
}]);
assert.equal(worksheet.blocked, false);
assert.equal(worksheet.finalState, 'prepared');
console.log('1: nonexistent worksheet date accepted into prepared history');

let adapterCalls = 0;
const request = {
  requestId: 'SYNTHETIC-R', tenantId: 'SYNTHETIC-T', clientId: 'SYNTHETIC-C', sampleId: 'SYNTHETIC-S',
  matrixCode: 'water-potable', dateSampled: '2026-02-30T09:00:00Z',
  dateReceived: '2026-03-02T11:00:00Z', analyses: ['SYNTHETIC-A'],
};
const created = await createOHWorksSenaiteSample(request, { tenantId: request.tenantId }, {
  createSample: async () => {
    adapterCalls++;
    return [{ senaiteSampleId: 'SYNTHETIC-S', tenantId: request.tenantId, matrixCode: request.matrixCode }];
  },
});
assert.equal(adapterCalls, 1);
assert.equal(created.status, 'CREATED');
console.log('2: nonexistent collection date reaches stub adapter and returns CREATED');

const baseline = {
  openWorklistItems: [], pendingCriticalValues: [], qcOutOfRangeCount: 0,
  instrumentsDown: [], now: '2026-03-02T12:00:00Z',
};
const handoff = buildShiftHandoffChecklist({ ...baseline, openWorklistItems: [{
  specimenId: 'SYNTHETIC-S', testCode: 'SYNTHETIC-T', status: 'pending', priority: 'stat', enteredAt: 'not-a-date',
}] });
assert.equal(handoff.readyForHandoff, true);
assert.equal(handoff.items[0].severity, 'info');
console.log('3: unreadable STAT entry time yields info and readyForHandoff=true');

const notification = buildShiftHandoffChecklist({ ...baseline, pendingCriticalValues: [{
  specimenId: 'SYNTHETIC-S', analyte: 'SYNTHETIC-A', value: 7.2, notifiedAt: '',
}] });
assert.equal(notification.readyForHandoff, true);
assert.equal(notification.items[0].severity, 'info');
assert.match(notification.items[0].description, /was notified at \./);
console.log('4: empty notification timestamp is described as notified and clears handoff');

const diff = diffResultVersions([{ analyteCode: 'SYNTHETIC-A', value: '0x10' }], [{ analyteCode: 'SYNTHETIC-A', value: 16 }]);
assert.deepEqual(diff.changed, []);
assert.deepEqual(diff.changeLines, []);
console.log('5: correction from radix text 0x10 to decimal 16 disappears from report diff');

const rules = [['ab', 'A', 'B'], ['ba', 'B', 'A'], ['ac', 'A', 'C'], ['cb', 'C', 'B']].map(
  ([id, triggerAnalyte, target]) => ({ id, triggerAnalyte, reflexAnalytes: [target], comparison: 'gt', threshold: 1, maxReflexDepth: 5 }),
);
const reflex = planReflexTests({ knownAnalytes: ['A', 'B', 'C'], rules, results: [] });
assert.equal(reflex.status, 'blocked');
assert.deepEqual(reflex.rejections.map(row => row.ruleId), ['ab', 'ba']);
// ac and cb also lie on the cycle A -> C -> B -> A but are omitted.
const permuted = planReflexTests({ knownAnalytes: ['A', 'B', 'C'], rules: [rules[2], rules[3], rules[1], rules[0]], results: [] });
assert.equal(permuted.status, 'blocked');
assert.notDeepEqual(permuted.rejections, reflex.rejections);
console.log('6: overlapping-cycle diagnostic omits ac/cb and changes with rule enumeration');
console.log('All six current defects reproduced. No product mutation or external I/O.');
