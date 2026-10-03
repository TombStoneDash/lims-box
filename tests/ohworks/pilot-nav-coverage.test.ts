import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const pilotRoot = resolve(root, 'app/pilot/ohworks');

function findPages(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return findPages(file);
    return entry.isFile() && entry.name === 'page.tsx' ? [file] : [];
  });
}

// The layout supplies href literals to PilotNavLink, which preserves the role query.
// Match link targets, rather than unrelated mentions of a route in source copy.
const navSources = ['layout.tsx', '_components/pilot-nav-link.tsx'];
const navTargets = new Set(navSources.flatMap((file) => {
  const source = readFileSync(resolve(pilotRoot, file), 'utf8');
  return Array.from(
    source.matchAll(/\bhref\s*(?::|=\s*\{?)\s*(['"`])([^'"`]+)\1/g),
    (match) => match[2],
  );
}));

const pages = findPages(pilotRoot)
  .filter((file) => file !== resolve(pilotRoot, 'page.tsx'))
  .sort();

test('OHWorks navigation coverage discovers child pages', () => {
  assert.ok(pages.length > 0, 'expected child page.tsx files under app/pilot/ohworks');
});

for (const page of pages) {
  const pagePath = relative(root, page).split(sep).join('/');
  const route = `/pilot/ohworks/${relative(pilotRoot, dirname(page)).split(sep).join('/')}`;

  test(`${pagePath} is linked from pilot navigation`, () => {
    assert.ok(
      navTargets.has(route),
      `${pagePath} is missing a navigation href target for ${route} in ${navSources.join(', ')}`,
    );
  });
}
