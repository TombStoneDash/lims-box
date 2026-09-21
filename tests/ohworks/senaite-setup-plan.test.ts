import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOHWorksSenaiteSetupPlan,
  DEFAULT_OHWORKS_SYNTHETIC_CONFIG,
  OHWorksSenaiteSetupPlanError,
  type OHWorksSenaiteSetupConfig,
  type OHWorksSenaiteSetupErrorCode,
} from '../../lib/ohworks-senaite-setup-plan';

const fixture = () => structuredClone(DEFAULT_OHWORKS_SYNTHETIC_CONFIG);
function rejects(input: unknown, code: OHWorksSenaiteSetupErrorCode) {
  assert.throws(() => buildOHWorksSenaiteSetupPlan(input as OHWorksSenaiteSetupConfig), error => {
    assert.ok(error instanceof OHWorksSenaiteSetupPlanError);
    assert.equal(error.code, code);
    assert.equal(error.message, `OHWorks synthetic setup rejected: ${code}`);
    return true;
  });
}

test('creates the complete synthetic plan with earlier, resolvable dependencies', () => {
  const config = fixture();
  config.analysisServices = [...config.analysisServices, {
    title: 'SYNTHETIC-Additional Assay', keyword: 'SYNTHETIC-ASSAY-003',
    category: 'SYNTHETIC-Additional Category', unit: 'IU/mL',
  }];
  const steps = buildOHWorksSenaiteSetupPlan(config);
  assert.deepEqual(steps.map(step => step.portalType), [
    'Client', 'Contact', 'SampleType', 'Instrument', 'AnalysisCategory',
    'AnalysisCategory', 'AnalysisService', 'AnalysisService', 'AnalysisService',
    'AnalysisProfile', 'LabContact',
  ]);
  for (const [index, step] of steps.entries()) {
    assert.equal(step.order, index + 1);
    assert.equal(step.endpoint, '/@@API/senaite/v1/create');
    assert.equal(step.payload.portal_type, step.portalType);
    for (const dependency of step.dependsOn) {
      assert.ok(dependency >= 1 && dependency < step.order);
      assert.equal(steps[dependency - 1].order, dependency);
    }
  }
  assert.deepEqual(steps[1].payload.parent, { $ref: 1 });
  assert.deepEqual(steps[1].dependsOn, [1]);
  assert.deepEqual(steps[6].payload.Category, { $ref: 5 });
  assert.deepEqual(steps[7].dependsOn, [5]);
  assert.deepEqual(steps[8].dependsOn, [6]);
  assert.deepEqual(steps[9].payload.Services, [{ $ref: 7 }, { $ref: 8 }]);
  assert.deepEqual(steps[9].dependsOn, [7, 8]);
  assert.equal(steps[6].payload.Keyword, config.analysisServices[0].keyword);
  assert.equal(steps[6].payload.Unit, config.analysisServices[0].unit);
});

test('is deterministic, leaves input untouched, and returns independent payloads', () => {
  const config = fixture();
  const before = structuredClone(config);
  const first = buildOHWorksSenaiteSetupPlan(config);
  const second = buildOHWorksSenaiteSetupPlan(config);
  assert.deepEqual(first, second);
  assert.deepEqual(config, before);
  first[0].payload.title = 'SYNTHETIC-Changed';
  first[1].dependsOn.push(999);
  assert.deepEqual(buildOHWorksSenaiteSetupPlan(config), second);
});

test('rejects duplicate service, profile, and cross-kind keywords', () => {
  const services = fixture();
  services.analysisServices = [...services.analysisServices, services.analysisServices[0]];
  rejects(services, 'duplicate-keyword');
  const profiles = fixture();
  profiles.analysisProfiles = [...profiles.analysisProfiles, profiles.analysisProfiles[0]];
  rejects(profiles, 'duplicate-keyword');
  const mixed = fixture();
  mixed.analysisProfiles[0].keyword = mixed.analysisServices[0].keyword;
  rejects(mixed, 'duplicate-keyword');
});

test('rejects profiles naming unknown services', () => {
  const config = fixture();
  config.analysisProfiles[0].serviceKeywords = ['SYNTHETIC-UNKNOWN-SERVICE'];
  rejects(config, 'unknown-service');
});

test('rejects blank titles in every entity and blank category titles', () => {
  for (const blank of ['', ' \t\n']) {
    for (const field of ['client', 'contact', 'sample', 'service', 'profile', 'instrument', 'user', 'category']) {
      const config = fixture();
      const entities = {
        client: config.client, contact: config.client.contacts![0], sample: config.sampleTypes[0],
        service: config.analysisServices[0], profile: config.analysisProfiles[0],
        instrument: config.instrument, user: config.labUsers[0],
      };
      if (field === 'category') config.analysisServices[0].category = blank;
      else entities[field as keyof typeof entities].title = blank;
      rejects(config, 'empty-title');
    }
  }
});

test('rejects credential-like keys at any depth, including unused fields and mixed case', () => {
  for (const key of ['password', 'secret', 'token', 'PASSWORD', 'apiToken', 'client_secret']) {
    for (const value of ['', null, 'SYNTHETIC-FORBIDDEN-VALUE']) {
      rejects({ ...fixture(), [key]: value }, 'credential-field');
      rejects({ ...fixture(), extra: [{ nested: { [key]: value } }] }, 'credential-field');
      const config = fixture();
      Object.defineProperty(config.labUsers[0], key, { value, enumerable: false });
      rejects(config, 'credential-field');
    }
  }
});

test('every default name and identifier is synthetic and no output key resembles a credential', () => {
  function scan(value: unknown): void {
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.doesNotMatch(key, /password|secret|token/i);
      if (['id', 'title', 'Keyword', 'ProfileKey', 'Model'].includes(key)) {
        assert.match(child as string, /^SYNTHETIC-.+/);
      }
      scan(child);
    }
  }
  scan(buildOHWorksSenaiteSetupPlan(fixture()));
});

test('rejects malformed input, unsafe identities, cycles, and accessors without invoking them', () => {
  for (const input of [null, [], {}, { ...fixture(), sampleTypes: null }]) rejects(input, 'invalid-config');
  const config = fixture();
  config.client.id = 'UNPREFIXED-FABRICATED-ID';
  rejects(config, 'non-synthetic-identity');
  const cyclic = { ...fixture(), extra: {} };
  cyclic.extra = cyclic;
  rejects(cyclic, 'invalid-config');
  let called = false;
  const accessor = fixture();
  Object.defineProperty(accessor, 'extra', { get() { called = true; return 'SYNTHETIC-IGNORED'; } });
  rejects(accessor, 'invalid-config');
  assert.equal(called, false);
});

test('contacts are optional and empty or repeated service references fail closed', () => {
  const config = fixture();
  delete config.client.contacts;
  assert.equal(buildOHWorksSenaiteSetupPlan(config).some(step => step.portalType === 'Contact'), false);
  config.analysisProfiles[0].serviceKeywords = [];
  rejects(config, 'invalid-config');
  config.analysisProfiles[0].serviceKeywords = ['SYNTHETIC-MEASLES-IGG', 'SYNTHETIC-MEASLES-IGG'];
  rejects(config, 'invalid-config');
});
