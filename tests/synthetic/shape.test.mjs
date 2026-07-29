import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  findSyntheticPrivacyViolations,
  SYNTHETIC_IDENTITY_ALLOWLIST,
} from '../../scripts/lib/synthetic-privacy.mjs';
import { validateSyntheticOutputDirectory } from '../../scripts/gen-synthetic-lims.mjs';

const repoRoot = resolve(import.meta.dirname, '../..');
const generator = join(repoRoot, 'scripts/gen-synthetic-lims.mjs');
const committedData = join(repoRoot, 'data/synthetic');
const expectedMatrices = new Set(['serum', 'plasma', 'swab', 'urine']);

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return nested
    .flat()
    .filter((path) => !path.endsWith('/.synthetic-lims-generator-owned'))
    .sort();
}

async function digestDirectory(directory) {
  const hash = createHash('sha256');
  for (const path of await listFiles(directory)) {
    hash.update(path.slice(directory.length));
    hash.update(await readFile(path));
  }
  return hash.digest('hex');
}

function runGenerator(outDir) {
  execFileSync(process.execPath, [generator, '--seed', '20260726', '--samples', '200', '--out-dir', outDir], {
    cwd: repoRoot,
    stdio: 'pipe',
  });
}

test('generator is deterministic and committed data is current', async () => {
  const first = await uniqueRepoOutput('first');
  const second = await uniqueRepoOutput('second');

  try {
    runGenerator(first);
    runGenerator(second);
    assert.equal(await digestDirectory(first), await digestDirectory(second));
    assert.equal(await digestDirectory(first), await digestDirectory(committedData));
  } finally {
    await Promise.all([first, second].map((path) => rm(path, { recursive: true, force: true })));
  }
});

async function uniqueRepoOutput(label) {
  const holder = await mkdtemp(join(repoRoot, `.synthetic-data-${label}-`));
  await rm(holder, { recursive: true, force: true });
  return holder;
}

function runGeneratorExpectFailure(outDir) {
  assert.throws(
    () => runGenerator(outDir),
    /Unsafe synthetic output target/,
  );
}

test('generator rejects unsafe recursive-delete targets and preserves sentinels', async () => {
  const outside = await mkdtemp('/tmp/lims-synthetic-unsafe-');
  const outsideSentinel = join(outside, 'sentinel.txt');
  const unsafeNamed = await mkdtemp(join(repoRoot, '.synthetic-data-unowned-'));
  const unsafeNamedSentinel = join(unsafeNamed, 'sentinel.txt');
  const symlinkTarget = await mkdtemp('/tmp/lims-synthetic-symlink-target-');
  const symlinkSentinel = join(symlinkTarget, 'sentinel.txt');
  const symlinkPath = join(repoRoot, `.synthetic-data-symlink-${process.pid}`);

  await Promise.all([
    writeFile(outsideSentinel, 'outside-preserved'),
    writeFile(unsafeNamedSentinel, 'unowned-preserved'),
    writeFile(symlinkSentinel, 'symlink-target-preserved'),
  ]);
  await symlink(symlinkTarget, symlinkPath);

  try {
    await assert.rejects(
      validateSyntheticOutputDirectory(repoRoot),
      /Unsafe synthetic output target/,
    );
    await assert.rejects(
      validateSyntheticOutputDirectory(join(committedData, '..', '..')),
      /Unsafe synthetic output target/,
    );
    runGeneratorExpectFailure(outside);
    runGeneratorExpectFailure(unsafeNamed);
    runGeneratorExpectFailure(symlinkPath);
    assert.equal(await readFile(outsideSentinel, 'utf8'), 'outside-preserved');
    assert.equal(await readFile(unsafeNamedSentinel, 'utf8'), 'unowned-preserved');
    assert.equal(await readFile(symlinkSentinel, 'utf8'), 'symlink-target-preserved');
  } finally {
    await Promise.all([
      rm(outside, { recursive: true, force: true }),
      rm(unsafeNamed, { recursive: true, force: true }),
      rm(symlinkPath, { force: true }),
      rm(symlinkTarget, { recursive: true, force: true }),
    ]);
  }
});

test('dataset has the required fabricated shape and matrix-valid orders', async () => {
  const [manifest, samples, catalog, results, personnel] = await Promise.all([
    readJson(join(committedData, 'manifest.json')),
    readJson(join(committedData, 'samples.json')),
    readJson(join(committedData, 'tests.json')),
    readJson(join(committedData, 'results.json')),
    readJson(join(committedData, 'personnel.json')),
  ]);

  assert.equal(manifest.contains_real_data, false);
  assert.equal(manifest.seed, 20260726);
  assert.equal(samples.length, 200);
  assert.equal(catalog.length, 30);
  assert.equal(personnel.length, 12);
  assert.ok(results.length >= 200);
  assert.ok(samples.filter((sample) => sample.status === 'in_progress').length > samples.length / 2);

  const catalogByCode = new Map(catalog.map((entry) => [entry.code, entry]));
  const sampleById = new Map(samples.map((sample) => [sample.id, sample]));

  for (const sample of samples) {
    assert.match(sample.id, SYNTHETIC_IDENTITY_ALLOWLIST.sampleId);
    assert.match(sample.customer_id, SYNTHETIC_IDENTITY_ALLOWLIST.customerId);
    assert.ok(expectedMatrices.has(sample.matrix));
    assert.equal(sample.synthetic, true);
    assert.ok(sample.test_codes.length >= 1);
    for (const code of sample.test_codes) {
      const catalogEntry = catalogByCode.get(code);
      assert.ok(catalogEntry?.valid_matrices.includes(sample.matrix));
      assert.ok(
        catalogEntry?.containers_per_test.some(
          (container) => container.matrix === sample.matrix && container.type === sample.container,
        ),
      );
    }
  }

  for (const entry of catalog) {
    assert.ok(entry.valid_matrices.length >= 1);
    assert.equal(entry.containers_per_test.length, entry.valid_matrices.length);
    assert.deepEqual(
      new Set(entry.containers_per_test.map((container) => container.matrix)),
      new Set(entry.valid_matrices),
    );
    assert.ok(entry.analytes.length >= 1);
    assert.ok(entry.units);
    assert.ok(entry.detection_limit > 0);
    assert.equal(entry.synthetic, true);
  }

  for (const result of results) {
    const sample = sampleById.get(result.sample_id);
    const catalogEntry = catalogByCode.get(result.test_code);
    assert.ok(sample);
    assert.ok(catalogEntry);
    assert.ok(sample.test_codes.includes(result.test_code));
    assert.ok(['normal', 'below_detection', 'above_range'].includes(result.flag));
    assert.equal(result.units, catalogEntry.units);
    assert.equal(result.detection_limit, catalogEntry.detection_limit);
    assert.equal(result.synthetic, true);
    assert.match(result.id, SYNTHETIC_IDENTITY_ALLOWLIST.resultId);
    assert.match(result.sample_id, SYNTHETIC_IDENTITY_ALLOWLIST.sampleId);
  }

  for (const person of personnel) {
    assert.match(person.id, SYNTHETIC_IDENTITY_ALLOWLIST.personnelId);
    assert.match(person.display_name, SYNTHETIC_IDENTITY_ALLOWLIST.personnelName);
    for (const authorization of person.authorizations) {
      assert.match(authorization, SYNTHETIC_IDENTITY_ALLOWLIST.authorizationId);
    }
  }
});

test('HL7 fixtures are explicitly synthetic ORU_R01 messages', async () => {
  const hl7Dir = join(committedData, 'hl7/oru_r01_samples');
  const paths = await listFiles(hl7Dir);
  assert.equal(paths.length, 5);

  for (const path of paths) {
    const message = await readFile(path, 'utf8');
    assert.match(message, /^MSH\|\^~\\&\|SYNTHETIC_ANALYZER/m);
    assert.match(message, /\|ORU\^R01\|/);
    assert.match(message, /FABRICATED SYNTHETIC DEMO MESSAGE/);
    const pid = message.split('\n').find((line) => line.startsWith('PID|'));
    const msh = message.split('\n').find((line) => line.startsWith('MSH|'));
    assert.ok(pid);
    assert.ok(msh);
    assert.match(pid.split('|')[3].split('^')[0], SYNTHETIC_IDENTITY_ALLOWLIST.hl7SubjectId);
    assert.match(msh.split('|')[9], SYNTHETIC_IDENTITY_ALLOWLIST.hl7MessageId);
  }
});

test('generated artifacts reject common PHI, PII, identity, and secret patterns', async () => {
  const paths = await listFiles(committedData);
  const artifacts = await Promise.all(
    paths.map(async (path) => ({ path, content: await readFile(path, 'utf8') })),
  );
  assert.deepEqual(findSyntheticPrivacyViolations(artifacts), []);
});

test('privacy scanner detects adversarial PHI, PII, identity, and secret fixtures', () => {
  const adversarial = [
    ['email', 'contact Jane.Doe@example.org'],
    ['ssn', 'subject 123-45-6789'],
    ['phone', 'call (415) 555-0123'],
    ['street_address', 'location 123 Main Street'],
    ['medical_identity_label', 'MRN: 849201'],
    ['private_key', '-----BEGIN PRIVATE KEY-----'],
    ['bearer_token', 'Bearer abcdefghijklmnopqrstuvwxyz'],
    ['secret_assignment', 'API_KEY=supersecretvalue'],
    ['secret_assignment', '{"api_key":"supersecretvalue"}'],
    ['secret_assignment', '{"password":"hunterhunter"}'],
    ['secret_assignment', 'token: abcdefghijklmnop'],
    ['secret_assignment', "secret = 'abcdefghijklmnop'"],
    ['provider_token', ['sk_', 'live_', 'abcdefghijklmnopqrstuvwxyz'].join('')],
    ['provider_token', ['sk_', 'test_', 'abcdefghijklmnopqrstuvwxyz'].join('')],
    ['provider_token', ['ghp_', 'abcdefghijklmnopqrstuvwxyz123456'].join('')],
    ['provider_token', ['AKIA', 'ABCDEFGHIJKLMNOP'].join('')],
    ['jwt', 'eyJabcdefghijk.abcdefghijkl.abcdefghijkl'],
  ];
  for (const [expectedCategory, content] of adversarial) {
    assert.ok(
      findSyntheticPrivacyViolations([{ path: 'adversarial.fixture', content }]).some(
        ({ category }) => category === expectedCategory,
      ),
      `failed to detect ${expectedCategory}`,
    );
  }
});

test('privacy scanner allows synthetic and non-credential lookalikes', () => {
  const safeNegatives = [
    '{"token_count":344}',
    '{"token":"synthetic"}',
    'api_key: UNKNOWN',
    'password policy applies',
    'Synthetic secret discipline training',
    'sk_test_placeholder',
    'SYN-AUTH-001',
  ];
  assert.deepEqual(
    findSyntheticPrivacyViolations(
      safeNegatives.map((content, index) => ({ path: `safe-negative-${index}.fixture`, content })),
    ),
    [],
  );
});
