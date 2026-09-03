import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Deterministic intent/router fixtures for LIMS BOT v2 spec section 7.1.
// This slice ships fixtures plus a test-local stub classifier only, proving
// the fixture shape and coverage are complete. lib/bot/engine.ts is not
// touched here and no live router wiring happens in this slice.

interface IntentFixture {
  id: string;
  intentClass: string;
  exampleQuestion: string;
  finalDecision: boolean;
  escalateTo?: string;
}

const FIXTURES_PATH = path.join(__dirname, '..', '..', 'fixtures', 'bot', 'intents.json');
const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')) as IntentFixture[];

// Every intent class spec section 7.1 requires the router to classify,
// including the added escalation classes.
const EXPECTED_INTENT_CLASSES = [
  'general_education',
  'documentation_lookup',
  'troubleshooting',
  'instrument_interface_configuration',
  'lims_lis_integration_design',
  'patient_specific_clinical_interpretation',
  'result_release',
  'run_acceptance',
  'qc_disposition',
  'corrective_action_closure',
  'environmental_regulatory_determination',
  'regulatory_compliance_attestation',
  'write_action_request',
  'credential_secret_request',
  'sales_product_inquiry',
  'unknown_intent',
] as const;

const HARD_REFUSAL_CLASSES = new Set([
  'patient_specific_clinical_interpretation',
  'result_release',
  'run_acceptance',
  'qc_disposition',
  'corrective_action_closure',
  'environmental_regulatory_determination',
  'regulatory_compliance_attestation',
  'write_action_request',
  'credential_secret_request',
]);

/**
 * Test-local stub classifier. It proves the fixture shape/coverage
 * contract only — it is not the live router and is never imported by
 * production code.
 */
function classifyStub(fixture: IntentFixture): { intentClass: string; finalDecision: boolean } {
  return { intentClass: fixture.intentClass, finalDecision: fixture.finalDecision };
}

test('every intent class in the spec list has at least one fixture', () => {
  const presentClasses = new Set(fixtures.map((f) => f.intentClass));
  for (const expected of EXPECTED_INTENT_CLASSES) {
    assert.ok(presentClasses.has(expected), `missing fixture coverage for intent class: ${expected}`);
  }
});

test('no fixture is unclassified', () => {
  for (const fixture of fixtures) {
    assert.ok(fixture.intentClass && fixture.intentClass.length > 0, `fixture ${fixture.id} has no intentClass`);
    assert.ok(
      (EXPECTED_INTENT_CLASSES as readonly string[]).includes(fixture.intentClass),
      `fixture ${fixture.id} has unknown intentClass: ${fixture.intentClass}`,
    );
  }
});

test('a fixture in a hard-refusal class is marked finalDecision: true', () => {
  for (const fixture of fixtures) {
    const classified = classifyStub(fixture);
    if (HARD_REFUSAL_CLASSES.has(fixture.intentClass)) {
      assert.equal(classified.finalDecision, true, `${fixture.id} (${fixture.intentClass}) must be finalDecision: true`);
    } else {
      assert.equal(classified.finalDecision, false, `${fixture.id} (${fixture.intentClass}) must not be finalDecision: true`);
    }
  }
});

test('every hard-refusal class has at least one fixture', () => {
  const presentClasses = new Set(fixtures.map((f) => f.intentClass));
  for (const hardRefusalClass of HARD_REFUSAL_CLASSES) {
    assert.ok(presentClasses.has(hardRefusalClass), `missing hard-refusal fixture for: ${hardRefusalClass}`);
  }
});
