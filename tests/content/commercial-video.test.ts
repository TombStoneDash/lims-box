import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { COMMERCIAL_VIDEO_ID, resolveCommercialVideoId } from '../../lib/commercial-video';

test('commercial video is unconfigured by default', () => {
  assert.equal(COMMERCIAL_VIDEO_ID, '');
  assert.equal(resolveCommercialVideoId(COMMERCIAL_VIDEO_ID), null);
});

test('missing, empty, and whitespace-only input resolves to null', () => {
  for (const raw of [undefined, null, '', ' ', '\t\n']) {
    assert.equal(resolveCommercialVideoId(raw), null);
  }
});

test('the placeholder video is rejected', () => {
  assert.equal(resolveCommercialVideoId('dQw4w9WgXcQ'), null);
});

test('only exactly 11 YouTube ID characters are accepted', () => {
  for (const raw of ['abcDEF012_-', 'AbCdEfGhI12', '___________', '-----------']) {
    assert.equal(resolveCommercialVideoId(raw), raw);
  }
  for (const raw of [
    'abcDEF012_', 'abcDEF012_-x', 'abcDEF012_!', 'abcDEF012 é',
    'abc DEF012_', ' abcDEF012_-', 'abcDEF012_- ', 'abcDEF012_-\n',
    'https://www.youtube.com/watch?v=abcDEF012_-',
  ]) {
    assert.equal(resolveCommercialVideoId(raw), null, JSON.stringify(raw));
  }
});

test('the commercial page does not contain the placeholder video ID', () => {
  const source = readFileSync(path.join(__dirname, '../../app/commercial/page.tsx'), 'utf8');
  assert.ok(!source.includes('dQw4w9WgXcQ'));
});
