import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SKIP_LINK_LABEL, SKIP_LINK_TARGET_ID } from '../../lib/skip-link';

const layout = readFileSync(new URL('../../app/layout.tsx', import.meta.url), 'utf8');

test('skip-link constants provide a label and a valid fragment target', () => {
  assert.ok(SKIP_LINK_LABEL.trim().length > 0);
  assert.ok(SKIP_LINK_TARGET_ID.length > 0);
  assert.doesNotMatch(SKIP_LINK_TARGET_ID, /[\s#]/);
});

test('layout renders the shared skip link first in the body and before main', () => {
  assert.match(layout, /import\s*\{[^}]*SKIP_LINK_LABEL[^}]*SKIP_LINK_TARGET_ID[^}]*\}\s*from\s*['"]@\/lib\/skip-link['"]/);
  const anchor = layout.match(/<body\b[^>]*>\s*(<a\b[^>]*>\s*\{SKIP_LINK_LABEL\}\s*<\/a>)/);
  assert.ok(anchor, 'the skip link must be the first body child');
  assert.match(anchor[1], /href=\{`#\$\{SKIP_LINK_TARGET_ID\}`\}/);
  assert.ok(layout.indexOf(anchor[1]) < layout.indexOf('<main'));
  for (const utility of ['sr-only', 'focus:not-sr-only', 'focus:fixed', 'z-[9999]', 'bg-white', 'text-black', 'px-4', 'py-3', 'focus:ring-2', 'focus:ring-blue-700']) {
    assert.ok(anchor[1].includes(utility), `missing skip-link utility: ${utility}`);
  }
});

test('main uses the shared target and supports programmatic focus', () => {
  const main = layout.match(/<main\b[^>]*>/);
  assert.ok(main);
  assert.match(main[0], /id=\{SKIP_LINK_TARGET_ID\}/);
  assert.match(main[0], /tabIndex=\{-1\}/);
  assert.match(main[0], /className="outline-none"/);
});

test('the not-found page still documents the same main target', () => {
  const notFound = readFileSync(new URL('../../app/not-found.tsx', import.meta.url), 'utf8');
  assert.ok(notFound.includes(`<main id="${SKIP_LINK_TARGET_ID}">`));
});
