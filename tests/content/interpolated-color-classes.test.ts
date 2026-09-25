import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.join(__dirname, '..', '..');

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, exts, out);
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

const pricingPath = path.join(ROOT, 'app/pricing/page.tsx');
const walkthroughPath = path.join(ROOT, 'app/demo/walkthrough/page.tsx');
const pricingSource = readFileSync(pricingPath, 'utf8');
const walkthroughSource = readFileSync(walkthroughPath, 'utf8');

test('pricing page no longer interpolates the tier icon color class', () => {
  assert.doesNotMatch(pricingSource, /text-\$\{tier\.color\}/);
  assert.doesNotMatch(pricingSource, /\bcolor:\s*'lab-/);
});

test('walkthrough page no longer interpolates the step tile/icon color classes', () => {
  assert.doesNotMatch(walkthroughSource, /\.replace\(\s*['"]bg-['"]/);
  assert.doesNotMatch(walkthroughSource, /\$\{step\.color\}/);
  assert.doesNotMatch(walkthroughSource, /\bcolor:\s*'bg-/);
});

test('pricing tier icon classes are literal tokens present in the file', () => {
  const iconClasses = ['text-lab-teal', 'text-lab-blue', 'text-lab-sky'];
  for (const cls of iconClasses) {
    assert.ok(
      pricingSource.includes(cls),
      `expected literal class "${cls}" to appear in app/pricing/page.tsx so Tailwind emits it`,
    );
  }
});

test('walkthrough step tile/icon classes are literal tokens present in the file', () => {
  const classes = [
    'bg-blue-500/20', 'text-blue-500',
    'bg-purple-500/20', 'text-purple-500',
    'bg-green-500/20', 'text-green-500',
    'bg-amber-500/20', 'text-amber-500',
    'bg-teal-500/20', 'text-teal-500',
  ];
  for (const cls of classes) {
    assert.ok(
      walkthroughSource.includes(cls),
      `expected literal class "${cls}" to appear in app/demo/walkthrough/page.tsx so Tailwind emits it`,
    );
  }
});

test('no app/ or components/ source builds a Tailwind color class by interpolation', () => {
  const files = [
    ...walk(path.join(ROOT, 'app'), ['.tsx', '.ts']),
    ...walk(path.join(ROOT, 'components'), ['.tsx', '.ts']),
  ];
  const interpolatedColorClass = /\b(?:bg|text|border|ring)-\$\{/;
  const replaceBgPrefix = /\.replace\(\s*['"]bg-/;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    assert.doesNotMatch(source, interpolatedColorClass, `${rel} builds a color class via interpolation`);
    assert.doesNotMatch(source, replaceBgPrefix, `${rel} builds a color class via .replace('bg-', ...)`);
  }
});
