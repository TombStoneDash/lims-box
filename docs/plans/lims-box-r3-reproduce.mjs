// Planner evidence: these assertions reproduce defects, not corrected behavior.
import assert from 'node:assert/strict';
import { resolveEffectiveTestDefinition as resolve } from '../../lib/ohworks-effective-dating.ts';
import { expandOrderPanels } from '../../lib/ohworks-order-panel.ts';
import { renderResultComment, renderResultComments, CommentRenderError } from '../../lib/ohworks-result-comments.ts';
import { buildWorklistPlan } from '../../lib/ohworks-worklist.ts';

const version = {
  versionId: 'v1', testCode: 'GLU', methodIdentifier: 'synthetic', units: 'mg/dL',
  referenceInterval: { lowerBound: 70, upperBound: 100 }, effectiveFrom: '2026-01-01T00:00:00Z',
};
assert.equal(resolve([version], 'GLU', '2026-02-30T00:00:00Z').decision, 'resolved');
assert.equal(resolve([{ ...version, effectiveFrom: '2026-02-30T00:00:00Z' }], 'GLU', '2026-06-01T00:00:00Z').decision, 'resolved');
console.log('1: impossible result/catalog dates resolve');

const inverted = resolve([{ ...version, referenceInterval: { lowerBound: 100, upperBound: 70 } }], 'GLU', '2026-06-01T00:00:00Z');
assert.equal(inverted.decision, 'resolved');
assert.deepEqual(inverted.version.referenceInterval, { lowerBound: 100, upperBound: 70 });
console.log('2: inverted reference interval resolves');

assert.throws(() => expandOrderPanels({}, [], [{ kind: 'PANEL', code: 'constructor' }]),
  (error) => error instanceof TypeError && /not iterable/.test(error.message));
console.log('3: undeclared constructor panel throws native TypeError');

const specialTable = [{ code: 'NOTE', template: 'Reviewed by {constructor}', placeholders: ['constructor'], maxLength: 100, priority: 1 }];
assert.throws(() => renderResultComment(specialTable, { code: 'NOTE', values: {} }),
  (error) => error instanceof TypeError && !(error instanceof CommentRenderError));
console.log('4: missing constructor placeholder throws unhandled native TypeError');

const table = [{ code: 'NOTE', template: 'Reviewed by {name}', placeholders: ['name'], maxLength: 100, priority: 1 }];
const requests = [{ code: 'NOTE', values: { name: 'Alice' } }, { code: 'NOTE', values: { name: 'Bob' } }];
assert.notDeepEqual(renderResultComments(table, requests), renderResultComments(table, [...requests].reverse()));
console.log('5: repeated comment code output changes with request order');

const plan = buildWorklistPlan({
  specimens: [{ specimenId: '', priority: 'stat', accessionSequence: 1 }],
  bracketingRule: { everyNSamples: 5, qcSampleId: 'QC' }, maxRunLength: 10,
});
assert.equal(plan.runs[0].entries[1].kind, 'patient');
assert.equal(plan.runs[0].entries[1].specimenId, '');
console.log('6: blank specimen ID appears in a normal QC-bracketed worklist');
