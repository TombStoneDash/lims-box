import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '../..');
const generator = join(repoRoot, 'scripts/gen-synthetic-lims.mjs');
const committedData = join(repoRoot, 'data/synthetic');
const expectedMatrices = new Set(['serum', 'plasma', 'swab', 'urine']);
const realCorpusDenylist = [1684, 449, 589, 646, 945, 1197];

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
  return nested.flat().sort();
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
  const tempRoot = await mkdtemp(join(os.tmpdir(), 'lims-synthetic-'));
  const first = join(tempRoot, 'first');
  const second = join(tempRoot, 'second');

  try {
    runGenerator(first);
    runGenerator(second);
    assert.equal(await digestDirectory(first), await digestDirectory(second));
    assert.equal(await digestDirectory(first), await digestDirectory(committedData));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
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
    assert.match(sample.id, /^SYN-26\d{3}-\d{4}$/);
    assert.match(sample.customer_id, /^SYN-CUST-\d{3}$/);
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
    assert.doesNotMatch(message, /\b(?:patient|client) name\b/i);
  }
});

test('generated fixtures do not contain known real-corpus operational figures', async () => {
  const paths = await listFiles(committedData);
  const combined = (await Promise.all(paths.map((path) => readFile(path, 'utf8')))).join('\n');

  for (const value of realCorpusDenylist) {
    assert.doesNotMatch(combined, new RegExp(`\\b${value}\\b`), `found denylisted real-corpus figure ${value}`);
  }
});
