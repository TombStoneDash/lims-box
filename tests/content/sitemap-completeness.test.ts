import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const sitemapSource = readFileSync(path.join(appDir, 'sitemap.ts'), 'utf8');

// Intake forms intentionally stay out of search discovery despite their canonicals.
const excludedRoutes: Record<string, string> = {
  '/clinical/intake': 'Clinical intake form; intentionally excluded from the sitemap.',
  '/environmental/intake': 'Environmental intake form; intentionally excluded from the sitemap.',
};

function staticPages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name.includes('[') ? [] : staticPages(file);
    }
    return entry.isFile() && entry.name === 'page.tsx' ? [file] : [];
  });
}

test('every indexable static page with a canonical URL appears in the sitemap source', () => {
  const missing: string[] = [];
  for (const file of staticPages(appDir)) {
    const source = readFileSync(file, 'utf8');
    if (!/alternates\s*:\s*\{\s*canonical\s*:/.test(source) || /index\s*:\s*false\b/.test(source)) continue;

    const segments = path.relative(appDir, path.dirname(file)).split(path.sep);
    const route = '/' + segments.filter((segment) => segment && !/^\(.*\)$/.test(segment)).join('/');
    if (excludedRoutes[route]) continue;

    // Match the whole quoted route so /clia-tracker cannot stand in for /clia.
    const sitemapRoute = route === '/' ? '' : route;
    if (!['\'', '"', '`'].some((quote) => sitemapSource.includes(`${quote}${sitemapRoute}${quote}`))) {
      missing.push(route);
    }
  }
  assert.deepEqual(missing, [], `Missing sitemap routes: ${missing.join(', ')}`);
});

test('sitemap source contains no duplicate url values', () => {
  const seen = new Set<string>();
  const values = [...sitemapSource.matchAll(/\burl\s*:\s*(['"`])([\s\S]*?)\1/g)];
  assert.ok(values.length > 0, 'Expected sitemap url values');
  for (const [, , value] of values) {
    assert.ok(!seen.has(value), `Duplicate sitemap url: ${value}`);
    seen.add(value);
  }
});
