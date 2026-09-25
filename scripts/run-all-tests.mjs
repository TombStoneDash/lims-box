import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

// Keep exclusions explicit and explain why each file cannot run in CI.
const EXCLUDED = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return walk(file);
    return entry.isFile() && /\.test\.tsx?$/.test(file) ? [file] : [];
  });
}

const excludedFiles = new Set(EXCLUDED.map(({ file }) => file));
const files = walk('tests').sort().filter((file) => !excludedFiles.has(file));
console.log(`Running ${files.length} test files.`);
console.log('Excluded files:', EXCLUDED);

if (files.length === 0) {
  console.error('No test files found to run.');
  process.exit(1);
}

const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...files], {
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error('Failed to start test runner:', error.message);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
