import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const layout = readFileSync('app/pilot/ohworks/layout.tsx', 'utf8');
const links = readFileSync('app/pilot/ohworks/_components/pilot-nav-link.tsx', 'utf8');

test('pilot navigation has unique existing routes and known icon keys', () => {
  const nav = layout.match(/const nav = \[([\s\S]*?)\] as const/);
  assert.ok(nav, 'navigation array must be found');
  const entries = [...nav[1].matchAll(/\{\s*href:\s*'([^']+)'[^}]*icon:\s*'([^']+)'\s*\}/g)];
  assert.ok(entries.length > 0);
  const hrefs = [...nav[1].matchAll(/href:\s*'([^']+)'/g)].map((entry) => entry[1]);
  assert.equal(entries.length, hrefs.length, 'every href has an icon');
  assert.equal(new Set(hrefs).size, hrefs.length);
  const map = links.match(/const icons = \{([\s\S]*?)\} as const/);
  assert.ok(map, 'icon map must be found');
  const keys = new Set([...map[1].matchAll(/\b(\w+)\s*:/g)].map((entry) => entry[1]));
  for (const [, href, icon] of entries) {
    assert.ok(existsSync(`app${href}/page.tsx`), `missing page for ${href}`);
    assert.ok(keys.has(icon), `unknown icon ${icon}`);
  }
  const expected = ['result-review', 'critical-results', 'reports'].filter((route) => existsSync(`app/pilot/ohworks/${route}/page.tsx`)).map((route) => `/pilot/ohworks/${route}`);
  const qcIndex = hrefs.indexOf('/pilot/ohworks/qc');
  assert.ok(qcIndex >= 0);
  assert.deepEqual(hrefs.slice(qcIndex + 1, qcIndex + 1 + expected.length), expected);
});

test('pilot metadata prevents indexing and following', () => {
  assert.match(layout, /export const metadata:\s*Metadata/);
  assert.match(layout, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
});
