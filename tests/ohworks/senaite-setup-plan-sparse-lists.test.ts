import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOHWorksSenaiteSetupPlan,
  DEFAULT_OHWORKS_SYNTHETIC_CONFIG,
  OHWorksSenaiteSetupPlanError,
  type OHWorksSenaiteSetupConfig,
} from '../../lib/ohworks-senaite-setup-plan';

const fixture = () => structuredClone(DEFAULT_OHWORKS_SYNTHETIC_CONFIG);

function rejectsInvalidConfig(input: unknown) {
  assert.throws(() => buildOHWorksSenaiteSetupPlan(input as OHWorksSenaiteSetupConfig), error => {
    assert.ok(error instanceof OHWorksSenaiteSetupPlanError);
    assert.equal(error.code, 'invalid-config');
    assert.equal(error.message, 'OHWorks synthetic setup rejected: invalid-config');
    return true;
  });
}

test('dense default config still builds the same plan', () => {
  assert.deepEqual(buildOHWorksSenaiteSetupPlan(fixture()), buildOHWorksSenaiteSetupPlan(fixture()));
  const steps = buildOHWorksSenaiteSetupPlan(fixture());
  assert.deepEqual(steps.map(step => step.portalType), [
    'Client', 'Contact', 'SampleType', 'Instrument', 'AnalysisCategory',
    'AnalysisService', 'AnalysisService', 'AnalysisProfile', 'LabContact',
  ]);
});

test('rejects a hole in client.contacts', () => {
  const config = fixture();
  const contacts = [config.client.contacts![0]];
  delete (contacts as unknown[])[1];
  (contacts as unknown[]).length = 2;
  config.client = { ...config.client, contacts };
  rejectsInvalidConfig(config);
});

test('rejects a hole in sampleTypes', () => {
  const config = fixture();
  const sampleTypes = [config.sampleTypes[0]];
  delete (sampleTypes as unknown[])[1];
  (sampleTypes as unknown[]).length = 2;
  config.sampleTypes = sampleTypes;
  rejectsInvalidConfig(config);
});

test('rejects a hole in analysisServices', () => {
  const config = fixture();
  const services = [...config.analysisServices];
  delete (services as unknown[])[0];
  config.analysisServices = services;
  rejectsInvalidConfig(config);
});

test('rejects a hole in analysisProfiles', () => {
  const config = fixture();
  const profiles = [config.analysisProfiles[0]];
  delete (profiles as unknown[])[1];
  (profiles as unknown[]).length = 2;
  config.analysisProfiles = profiles;
  rejectsInvalidConfig(config);
});

test('rejects a hole in serviceKeywords', () => {
  const config = fixture();
  const serviceKeywords = ['SYNTHETIC-MEASLES-IGG'];
  delete (serviceKeywords as unknown[])[1];
  (serviceKeywords as unknown[]).length = 2;
  serviceKeywords.push('SYNTHETIC-RUBELLA-IGG');
  config.analysisProfiles[0].serviceKeywords = serviceKeywords;
  rejectsInvalidConfig(config);
});

test('rejects a hole in labUsers', () => {
  const config = fixture();
  const labUsers = [config.labUsers[0]];
  delete (labUsers as unknown[])[1];
  (labUsers as unknown[]).length = 2;
  config.labUsers = labUsers;
  rejectsInvalidConfig(config);
});
