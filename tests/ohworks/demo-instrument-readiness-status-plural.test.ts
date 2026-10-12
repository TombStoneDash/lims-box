import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInstrumentReadinessView, createPilotInstrumentReadinessFixture } from '../../lib/ohworks-demo-instrument-readiness-view';

test('statusText uses singular "finding" when exactly one blocking finding exists', () => {
  const fixture = createPilotInstrumentReadinessFixture();
  const view = buildInstrumentReadinessView({ ...fixture, messages: [fixture.messages[1]], schedules: [], lotIds: [] });
  assert.equal(view.blockingFindings, 1);
  assert.equal(view.statusText, 'Not ready to run — 1 blocking finding');
});

test('statusText uses plural "findings" for the default five-finding fixture', () => {
  const view = buildInstrumentReadinessView(createPilotInstrumentReadinessFixture());
  assert.equal(view.blockingFindings, 5);
  assert.equal(view.statusText, 'Not ready to run — 5 blocking findings');
});
