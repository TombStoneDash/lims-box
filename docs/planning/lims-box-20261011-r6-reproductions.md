# Executable synthetic reproductions

Run from the repository root on Node 22. Save the block to a temporary `.mjs` file and invoke `node --experimental-strip-types <file>`. No installed packages, network or product writes are needed.

```js
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const moduleFor = async (name) => import(pathToFileURL(`${root}/lib/ohworks-${name}.ts`));
const { evaluateCarryoverRisk } = await moduleFor('carryover');
const carryover = evaluateCarryoverRisk({
  rules: [{ analyteCode: 'SYNTH-A', highThreshold: 0.1, carryoverFactor: 0.1, repeatThreshold: 0.01 }],
  results: [0.1, 0.001].map((value, i) => ({ resultId: `SYNTH-${i}`, position: i + 1, analyteCode: 'SYNTH-A', value, washBefore: false })),
})[1];
assert.equal(carryover.status, 'must_repeat');
console.log('J1 actual:', JSON.stringify(carryover), 'expected: at_risk at exact decimal threshold');

const { evaluateReferenceRange } = await moduleFor('reference-range');
const reference = evaluateReferenceRange({ result: '0x10', unit: 'synthetic-units', limitOfDetection: 1, upperLimitOfQuantitation: 100,
  referenceRange: { lowerBound: 1, upperBound: 20, unit: 'synthetic-units' } });
assert.equal(reference.classification, 'within_range');
console.log('J2 actual:', JSON.stringify(reference), 'expected: invalid for radix text');

const { resolveTatTarget } = await moduleFor('tat-catalogue');
const tat = resolveTatTarget({ rows: ['weekday', 'weekend', 'holiday'].map(dayType => ({ testCode: 'SYNTH-A', priority: 'routine', dayType, targetHours: 24 })), holidayDates: [] },
  { orderId: 'SYNTH-ORDER', testCode: 'SYNTH-A', priority: 'routine', receivedAt: '2026-02-30T12:00:00Z' });
assert.equal(tat.receivedAt, '2026-03-02T12:00:00.000Z');
console.log('J3 actual:', JSON.stringify(tat), 'expected: TatInputError invalid-received-at');

const { computeReportDistribution } = await moduleFor('report-distribution');
const distribution = computeReportDistribution({ reportReferenceToken: 'SYNTH-RPT', kind: 'FINAL', testClasses: ['SYNTH-CHEM'] },
  [{ recipientRole: '   ', channelType: 'ENCRYPTED_EMAIL', allowedTestClasses: ['SYNTH-CHEM'], requiresFinal: true }]);
assert.equal(distribution.status, 'DISTRIBUTED');
assert.deepEqual(distribution.recipientRoles, ['   ']);
console.log('J4 actual:', JSON.stringify(distribution), 'expected: ReportDistributionInputError rule-malformed');

const { authorizeAnalystRelease } = await moduleFor('analyst-authorization');
const authorization = authorizeAnalystRelease({ analystId: 'SYNTH-ANALYST', role: 'ANALYST', competencies: [{ method: 'SYNTH-METHOD', assessedAt: '2026-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z' }] },
  { resultId: 'SYNTH-RESULT', method: 'SYNTH-METHOD', flag: 'ROUTINE', timestamp: '2026-06-01T12:00:00+00:99' });
assert.equal(authorization.decision, 'AUTHORIZED');
assert.equal(Number.isNaN(Date.parse('2026-06-01T12:00:00+00:99')), true);
console.log('J5 actual:', JSON.stringify(authorization), 'expected: REFUSED timestamp-invalid');

const { authorizeOrder } = await moduleFor('order-authorization');
const order = authorizeOrder([{ role: 'SYNTH-REQUESTER', testClass: 'SYNTH-CLASS', requiresCosign: true }],
  { requesterId: ' SYNTH-PERSON ', role: 'SYNTH-REQUESTER', validFrom: '2026-01-01T00:00:00Z', validUntil: '2027-01-01T00:00:00Z' },
  { orderId: 'SYNTH-ORDER', testClass: 'SYNTH-CLASS', timestamp: '2026-06-01T12:00:00Z', cosignerId: ' SYNTH-PERSON ' });
assert.equal(order.decision, 'AUTHORIZED');
console.log('J6 actual:', JSON.stringify(order), 'expected: REFUSED cosigner-same-as-requester for identical input IDs');
console.log('6/6 current defects reproduced; these assertions confirm present defects, not repaired behavior.');
```

Observed output (exit 0):

```text
J1 actual: {"resultId":"SYNTH-1","status":"must_repeat","reasonCode":"contribution-exceeds-threshold","contribution":0.010000000000000002,"sourcePosition":1} expected: at_risk at exact decimal threshold
J2 actual: {"classification":"within_range","flag":"WITHIN REFERENCE RANGE","reasons":[]} expected: invalid for radix text
J3 actual: {"orderId":"SYNTH-ORDER","testCode":"SYNTH-A","priority":"routine","dayType":"weekday","targetHours":24,"receivedAt":"2026-03-02T12:00:00.000Z","dueAt":"2026-03-03T12:00:00.000Z","reasonCode":"matched-declared-row"} expected: TatInputError invalid-received-at
J4 actual: {"reportReferenceToken":"SYNTH-RPT","kind":"FINAL","status":"DISTRIBUTED","recipientRoles":["   "],"channelTypes":["ENCRYPTED_EMAIL"],"routedEntries":[{"testClass":"SYNTH-CHEM","recipientRole":"   ","channelType":"ENCRYPTED_EMAIL"}],"unroutedTestClasses":[]} expected: ReportDistributionInputError rule-malformed
J5 actual: {"resultId":"SYNTH-RESULT","decision":"AUTHORIZED","rule":"routine-authorized"} expected: REFUSED timestamp-invalid
J6 actual: {"orderId":"SYNTH-ORDER","decision":"AUTHORIZED","rule":"authorized-with-cosign"} expected: REFUSED cosigner-same-as-requester for identical input IDs
6/6 current defects reproduced; these assertions confirm present defects, not repaired behavior.
```

Existing six-file test-run summary:

```text
  ...
1..196
# tests 196
# suites 0
# pass 196
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1623.327542
```
