import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import UnsubscribePage from '../../app/unsubscribe/page';

// tsx compiles this repository's preserved JSX in classic mode.
Object.assign(globalThis, { React });

async function renderList(list: string | undefined) {
  const markup = renderToStaticMarkup(
    await UnsubscribePage({
      searchParams: Promise.resolve({ email: 'person@example.com', list }),
    })
  );
  const match = markup.match(/Unsubscribe from ([^<]*)</);
  return match ? match[1] : null;
}

for (const list of ['all', 'ALL', 'All', ' all ']) {
  test(`list=${JSON.stringify(list)} renders the all-emails wording`, async () => {
    assert.equal(await renderList(list), 'all LIMS BOX emails');
  });
}

for (const list of [undefined, '', 'newsletter', 'everything']) {
  test(`list=${JSON.stringify(list)} renders the newsletter wording`, async () => {
    assert.equal(await renderList(list), 'the LIMS BOX newsletter');
  });
}
