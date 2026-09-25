import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../components/WaitlistFooter.tsx', import.meta.url), 'utf8');

test('footer inputs have hidden labels tied to unique React IDs and autocomplete', () => {
  const labels = [...source.matchAll(/<label\b[^>]*htmlFor=\{(\w+)\}[^>]*>[\s\S]*?<\/label>/g)];
  assert.equal(labels.length, 2);
  assert.equal(new Set(labels.map(label => label[1])).size, 2);
  for (const [label, id] of labels) {
    assert.match(label, /className="sr-only"/);
    assert.match(source, new RegExp(`const ${id} = useId\\(\\)`));
    assert.match(source, new RegExp(`<input\\b[^>]*id=\\{${id}\\}`));
  }
  assert.match(source, /<input\b[^>]*autoComplete="email"[^>]*type="email"/);
  assert.match(source, /<input\b[^>]*autoComplete="organization"/);
});

test('footer announces outcomes and exposes readable busy feedback', () => {
  assert.match(source, /role="status"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /Something went wrong\. Please try again or email info@lims\.bot\./);
  assert.match(source, /<form\b[^>]*aria-busy=\{status === 'loading'\}/);
  const button = source.match(/<button\b[\s\S]*?<\/button>/)?.[0];
  assert.ok(button);
  assert.match(button, /Joining…/);
  assert.doesNotMatch(button, /['"]\.\.\.['"]|>\s*\.\.\.\s*</);
  for (const icon of ['CheckCircle2', 'ArrowRight', 'FlaskConical']) {
    assert.match(source, new RegExp(`<${icon}\\b[^>]*aria-hidden="true"`));
  }
});

test('footer link columns have a named navigation landmark', () => {
  assert.match(source, /<nav\b[^>]*aria-label="Footer"/);
  const nav = source.match(/<nav\b[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav);
  assert.equal([...nav.matchAll(/href="\//g)].length, [...source.matchAll(/href="\//g)].length);
});

test('every footer internal link resolves to an existing app page', () => {
  const links = [...source.matchAll(/href="(\/[^\"]*)"/g)].map(match => match[1]);
  assert.ok(links.length > 0);
  for (const href of links) {
    assert.ok(existsSync(new URL(`../../app${href}/page.tsx`, import.meta.url)), `Missing page for ${href}`);
  }
});
