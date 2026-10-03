import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VideoSection } from '../../components/VideoSection';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

const ROOT = path.join(__dirname, '..', '..');

test('demo player gets its own honest accessible name and no eager iframe', () => {
  const markup = renderToStaticMarkup(
    React.createElement(VideoSection, {
      videoId: 'AyR4LYKMUfM',
      title: 'LIMS BOX product demo (30-second cut)',
    }),
  );

  assert.match(markup, /aria-label="Play video: LIMS BOX product demo \(30-second cut\)"/);
  assert.match(markup, /type="button"/);
  assert.doesNotMatch(markup, /<iframe/);
});

test('default render drops the unverifiable duration claim and uses a generic honest name', () => {
  const markup = renderToStaticMarkup(React.createElement(VideoSection, { videoId: 'D3cW20SbU3Y' }));

  assert.doesNotMatch(markup, /2:45/);
  assert.match(markup, /aria-label="Play video: LIMS BOX video"/);
});

test('decorative Play icon is hidden from assistive tech', () => {
  const markup = renderToStaticMarkup(React.createElement(VideoSection, { videoId: 'D3cW20SbU3Y' }));

  assert.match(markup, /<svg[^>]*aria-hidden="true"[^>]*>/);
});

test('VideoSection focuses the mounted iframe when activated, instead of dropping focus to <body>', () => {
  // Focus handoff behaviour (keyboard activation -> focus moves into the
  // iframe, not <body>) already has dedicated coverage in
  // tests/content/video-section-focus.test.tsx, which exercises the actual
  // callback-ref handoff by invoking the component directly. This assertion
  // just guards that the mechanism (a ref callback that calls .focus() on
  // the mounted iframe) is still present in source.
  const source = readFileSync(path.join(ROOT, 'components/VideoSection.tsx'), 'utf8');

  assert.match(source, /<iframe\s/);
  assert.match(source, /\.focus\(\)/);
});

test('homepage gives the commercial and demo players distinct, explicit names', () => {
  const source = readFileSync(path.join(ROOT, 'app/page.tsx'), 'utf8');

  const videoSectionMatches = source.match(/<VideoSection\b[^/]*\/>/g) ?? [];
  assert.equal(videoSectionMatches.length, 2, 'expected exactly two <VideoSection /> elements on the homepage');

  const titles = videoSectionMatches.map((el) => {
    const match = el.match(/title="([^"]+)"/);
    assert.ok(match, `expected a title= prop on ${el}`);
    return match[1];
  });

  assert.notEqual(titles[0], titles[1]);

  // Guard the SENAITE/RidingBytes claims test this task must not break.
  assert.match(source, /LIMS BOX uses SENAITE/);
});
