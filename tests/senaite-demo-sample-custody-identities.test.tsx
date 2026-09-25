import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SampleDetailPage from '../app/senaite-demo/samples/[id]/page';
import { featuredSample } from '../lib/demo-data';

// tsx uses the classic JSX runtime for this repository's preserved JSX.
Object.assign(globalThis, { React });

function panelFields(markup: string, title: string) {
  const panel = markup.match(new RegExp(`${title}</h2>\\s*<dl\\b[^>]*>([\\s\\S]*?)</dl>`));
  assert.ok(panel, `${title} panel exists`);
  return Object.fromEntries(
    [...panel[1].matchAll(/<dt\b[^>]*>([^<]+)<\/dt>\s*<dd\b[^>]*>([^<]*)<\/dd>/g)]
      .map((match) => [match[1], match[2]]),
  );
}

async function assertCustodyMatchesSample() {
  const markup = renderToStaticMarkup(await SampleDetailPage({
    params: Promise.resolve({ id: featuredSample.id }),
  }));
  const custody = panelFields(markup, 'Chain of Custody');
  const information = panelFields(markup, 'Sample Information');

  for (const [custodyLabel, informationLabel, expected] of [
    ['Collected By', 'Collected By', featuredSample.collectedBy],
    ['Received By', 'Received By', featuredSample.receivedBy],
    ['Receipt Time', 'Date Received', featuredSample.dateReceived],
    ['Analyzed By', 'Analyst', featuredSample.analyst],
  ]) {
    assert.equal(information[informationLabel], expected, `sample information: ${informationLabel}`);
    assert.equal(custody[custodyLabel], expected, `custody: ${custodyLabel}`);
    assert.equal(custody[custodyLabel], information[informationLabel]);
  }
  assert.equal(custody['Processed By'], 'Unavailable in demo');
  assert.ok(!Object.values(custody).includes('Mike Torres'));
  assert.ok(!Object.values(custody).includes('James Kim'));

  // Other custody fixture details remain intact.
  assert.equal(custody['COC Number'], 'COC-2026-0847');
  assert.equal(custody['Collection Time'], '2026-04-11 08:15');
  assert.equal(custody['Condition'], 'Good — no issues noted');
  assert.equal(custody['Processing'], 'Centrifuged 3000 RPM x 10 min');
  assert.equal(custody['Analysis Time'], '2026-04-11 10:22');
}

test('custody identities and receipt time match the featured sample information', async () => {
  await assertCustodyMatchesSample();
});

test('custody follows mocked alternative sample identities and receipt time', async () => {
  const original = { ...featuredSample };
  // Mock the fixture in memory only and restore it even if an assertion fails.
  Object.assign(featuredSample, {
    collectedBy: 'Morgan Chen',
    receivedBy: 'Riley Brooks',
    analyst: 'Taylor Rivera',
    dateReceived: '2026-05-12 14:37',
  });
  try {
    await assertCustodyMatchesSample();
  } finally {
    Object.assign(featuredSample, original);
  }
});
