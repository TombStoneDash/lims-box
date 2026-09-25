import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = readFileSync(path.join(__dirname, '../../app/commercial/page.tsx'), 'utf8');

test('the commercial page has exactly one h1', () => {
  const h1Matches = source.match(/<h1\b/g) ?? [];
  assert.equal(h1Matches.length, 1);
});

test('the first heading on the page is the h1', () => {
  const headingMatch = source.match(/<h[1-6]\b/);
  assert.ok(headingMatch, 'a heading tag exists');
  assert.equal(headingMatch[0], '<h1');
});

test('no heading is nested inside the video play button', () => {
  const buttonMatch = source.match(/<button\b[\s\S]*?<\/button>/);
  assert.ok(buttonMatch, 'the play button exists');
  assert.ok(!/<h[1-6]\b/.test(buttonMatch[0]));
});

test('the video fallback copy is present and not marked up as a heading', () => {
  assert.ok(source.includes('Video coming soon'));
  assert.ok(source.includes('Explore the demo or pricing while we prepare our video.'));

  const fallbackLine = source.split('\n').find((line) => line.includes('Video coming soon'));
  assert.ok(fallbackLine, 'fallback line exists');
  assert.ok(!/<h[1-6]\b/.test(fallbackLine));
});
