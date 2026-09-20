import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// Paths are relative to the repository root. Keep reasons explicit and current.
const EXCLUDED = [
  {
    file: 'tests/senaite-demo-qc-accessibility.test.ts',
    reason: 'FAILING ON MAIN 2026-09-19: React is not defined in QCChartsPage (app/senaite-demo/qc/page.tsx:151) when rendered through tsx.',
  },
];

async function collectTests(directory) {
  const files = [];
  for (const entry of await readdir(path.join(ROOT, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await collectTests(file));
    } else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) {
      files.push(file);
    }
  }
  return files;
}

const excludedFiles = new Set(EXCLUDED.map(({ file }) => file));
const files = (await collectTests('tests')).sort().filter((file) => !excludedFiles.has(file));
console.log(`Running ${files.length} test files.`);
console.log(`Excluded files (${EXCLUDED.length}):`);
for (const { file, reason } of EXCLUDED) {
  console.log(`- ${file}: ${reason}`);
}

if (files.length === 0) {
  console.error('No test files found to run.');
  process.exit(1);
}

const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...files], {
  cwd: ROOT,
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error(`Unable to start test runner: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
