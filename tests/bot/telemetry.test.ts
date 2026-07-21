import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askBot } from '../../lib/bot/engine';
import {
  recordBotTelemetry,
  telemetryForBotResponse,
  telemetryForRequestOutcome,
  type BotTelemetryEvent,
} from '../../lib/bot/telemetry';

test('grounded answer telemetry contains aggregate outcome fields only', () => {
  const privateQuestion = 'PRIVATE-SENTINEL-DO-NOT-LOG what does LIMS BOX cost per month?';
  const response = askBot(privateQuestion);
  const event = telemetryForBotResponse(response);

  assert.equal(event.event, 'lims_bot_request');
  assert.equal(event.outcome, 'grounded_answer');
  assert.equal(event.grounded, true);
  assert.ok(event.source_count >= 1);
  assert.ok(event.source_paths.includes('/faq'));
  assert.equal(event.has_follow_up, true);
  assert.equal(event.follow_up_path, '/early-adopter');

  const serialized = JSON.stringify(event);
  assert.ok(!serialized.includes(privateQuestion));
  assert.ok(!serialized.includes('PRIVATE-SENTINEL-DO-NOT-LOG'));
  assert.ok(!serialized.includes(response.answer));
  assert.ok(!serialized.includes('ip'));
  assert.ok(!serialized.includes('email'));
});

test('compliance and evidence-missing outcomes are distinguishable without content', () => {
  const compliance = telemetryForBotResponse(
    askBot('Is LIMS BOX compliant with laboratory regulations?'),
  );
  const missing = telemetryForBotResponse(
    askBot('Can it order pizza for the night shift?'),
  );

  assert.equal(compliance.outcome, 'compliance_answer');
  assert.equal(compliance.grounded, true);
  assert.ok(compliance.source_paths.includes('/compliance'));

  assert.equal(missing.outcome, 'evidence_missing');
  assert.equal(missing.grounded, false);
  assert.equal(missing.source_count, 0);
  assert.deepEqual(missing.source_paths, []);
});

test('request rejection and internal-error telemetry expose stable codes only', () => {
  for (const outcome of ['invalid_request', 'rate_limited', 'internal_error'] as const) {
    const event = telemetryForRequestOutcome(outcome);
    assert.deepEqual(event, {
      schema_version: '1.0',
      event: 'lims_bot_request',
      outcome,
      grounded: null,
      source_count: 0,
      source_paths: [],
      has_follow_up: false,
      follow_up_path: null,
    });
  }
});

test('telemetry sink uses info for normal outcomes and warn only for internal errors', () => {
  const infoCalls: Array<[string, BotTelemetryEvent]> = [];
  const warnCalls: Array<[string, BotTelemetryEvent]> = [];
  const sink = {
    info: (event: string, fields: BotTelemetryEvent) => infoCalls.push([event, fields]),
    warn: (event: string, fields: BotTelemetryEvent) => warnCalls.push([event, fields]),
  };

  recordBotTelemetry(telemetryForRequestOutcome('rate_limited'), sink);
  recordBotTelemetry(telemetryForRequestOutcome('internal_error'), sink);

  assert.equal(infoCalls.length, 1);
  assert.equal(infoCalls[0][0], 'lims_bot_request');
  assert.equal(infoCalls[0][1].outcome, 'rate_limited');
  assert.equal(warnCalls.length, 1);
  assert.equal(warnCalls[0][0], 'lims_bot_request');
  assert.equal(warnCalls[0][1].outcome, 'internal_error');
});
