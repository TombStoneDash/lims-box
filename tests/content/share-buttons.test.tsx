import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShareButtons, buildShareLinks } from '../../components/blog/ShareButtons';

test('share controls have distinct accessible names, decorative icons, and keyboard focus', () => {
  const markup = renderToStaticMarkup(React.createElement(ShareButtons, {
    title: 'Lab news',
    url: 'https://lims.bot/blog/lab-news',
  }));
  const controls = markup.match(/<(?:a|button)\b[^>]*>/g) ?? [];
  assert.equal(controls.length, 3);
  const names = controls.map(control => control.match(/aria-label="([^"]+)"/)?.[1]);
  assert.deepEqual(names, [
    'Share on X (opens in a new tab)',
    'Share on LinkedIn (opens in a new tab)',
    'Copy link',
  ]);
  for (const control of controls) {
    assert.match(control, /focus-visible:ring-2/);
    assert.match(control, /focus-visible:ring-lab-teal/);
  }
  for (const link of controls.slice(0, 2)) {
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="noopener noreferrer"/);
  }
  assert.match(controls[2], /type="button"/);
  const icons = markup.match(/<svg\b[^>]*>/g) ?? [];
  assert.equal(icons.length, 3);
  for (const icon of icons) {
    assert.match(icon, /aria-hidden="true"/);
  }
  assert.match(markup, /<span class="sr-only" role="status" aria-live="polite"><\/span>/);
});

test('buildShareLinks encodes title punctuation and spaces and the complete URL', () => {
  const title = 'Labs & water? Read more';
  const url = 'https://lims.bot/blog/lab news?topic=water&view=full';
  const encodedUrl = 'https%3A%2F%2Flims.bot%2Fblog%2Flab%20news%3Ftopic%3Dwater%26view%3Dfull';
  assert.deepEqual(buildShareLinks(title, url), {
    twitterUrl: `https://twitter.com/intent/tweet?text=Labs%20%26%20water%3F%20Read%20more&url=${encodedUrl}`,
    linkedinUrl: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
  });
});
