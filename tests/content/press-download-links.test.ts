import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pressDownloadLabel } from '../../lib/press-download-label';

const PRESS_PAGE = path.join(__dirname, '..', '..', 'app/press/page.tsx');

test('pressDownloadLabel formats an SVG file', () => {
  assert.equal(
    pressDownloadLabel('Logo — Dark Background', '/press/logo-dark.svg'),
    'Download Logo — Dark Background (SVG)',
  );
});

test('pressDownloadLabel formats a JPG file', () => {
  assert.equal(
    pressDownloadLabel('Primary Badge', '/logo-primary.jpg'),
    'Download Primary Badge (JPG)',
  );
});

test('pressDownloadLabel formats a PNG file', () => {
  assert.equal(
    pressDownloadLabel('Personnel List', '/screenshots/admin-personnel-pack.png'),
    'Download Personnel List (PNG)',
  );
});

test('pressDownloadLabel handles a file with no extension', () => {
  assert.equal(pressDownloadLabel('Mystery Asset', '/press/mystery-asset'), 'Download Mystery Asset');
});

test('pressDownloadLabel trims surrounding whitespace from the name', () => {
  assert.equal(
    pressDownloadLabel('  Icon Only  ', '/press/logo-icon.svg'),
    'Download Icon Only (SVG)',
  );
});

test('press page imports the download label helper', () => {
  const source = readFileSync(PRESS_PAGE, 'utf8');
  assert.match(source, /import\s*\{\s*pressDownloadLabel\s*\}\s*from ['"]@\/lib\/press-download-label['"]/);
});

test('both preview images are decorative with alt=""', () => {
  const source = readFileSync(PRESS_PAGE, 'utf8');
  const imgTags = [...source.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
  assert.equal(imgTags.length, 2, 'expected exactly two <img> tags on the press page');
  for (const img of imgTags) {
    assert.match(img, /alt=""/);
  }
});

test('no <img> still duplicates the visible caption via alt={logo.name} or alt={ss.name}', () => {
  const source = readFileSync(PRESS_PAGE, 'utf8');
  assert.doesNotMatch(source, /<img\b[^>]*alt=\{logo\.name\}/);
  assert.doesNotMatch(source, /<img\b[^>]*alt=\{ss\.name\}/);
});

test('both tile links carry an aria-label built from the helper', () => {
  const source = readFileSync(PRESS_PAGE, 'utf8');
  assert.match(source, /aria-label=\{pressDownloadLabel\(logo\.name,\s*logo\.file\)\}/);
  assert.match(source, /aria-label=\{pressDownloadLabel\(ss\.name,\s*ss\.file\)\}/);
});
