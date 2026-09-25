import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.join(__dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('sitemap pages and intake pages declare their own canonical', async (t) => {
  // Quoted static paths only: skip the empty homepage and dynamic blog URLs.
  const routes = new Set([
    ...Array.from(read('app/sitemap.ts').matchAll(/\burl:\s*(['"])(\/[^'"]*)\1/g),
      (match) => match[2]),
    '/clinical/intake',
    '/environmental/intake',
  ]);
  assert.ok(routes.size > 2, 'expected static sitemap routes');

  for (const route of routes) {
    await t.test(route, () => {
      const hasSelfCanonical = ['page.tsx', 'layout.tsx'].some((file) => {
        const relativePath = `app${route}/${file}`;
        if (!existsSync(path.join(ROOT, relativePath))) return false;
        return Array.from(read(relativePath).matchAll(/\bcanonical:\s*(['"])([^'"]*)\1/g))
          .some((match) => match[2] === route || match[2] === `https://lims.bot${route}`);
      });
      assert.ok(hasSelfCanonical,
        `${route}: add alternates: { canonical: '${route}' } to the page metadata (or a sibling layout.tsx for a 'use client' page) — otherwise it inherits the homepage canonical from app/layout.tsx`);
    });
  }
});

test('the root layout keeps the homepage canonical', () => {
  assert.match(read('app/layout.tsx'), /\bcanonical:\s*(['"])\/\1/);
});
