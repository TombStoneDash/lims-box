import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoEvidenceLibrary } from '../../app/demo/assistant/demo-evidence-library';
import catalog from '../../data/synthetic/tests.json';
import samples from '../../data/synthetic/samples.json';

const markup = renderToStaticMarkup(<DemoEvidenceLibrary />);
const articles = [...markup.matchAll(/<article\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];

function testArticle(code: string) {
  const id = `synthetic-test-${code.toLowerCase()}`;
  const matches = articles.filter((article) => article[1] === id);
  assert.equal(matches.length, 1, `Expected one article with citation ID ${id}`);
  return matches[0][2];
}

function containerEntries(article: string) {
  return [...article.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((entry) =>
    entry[1].replace(/<[^>]*>/g, '').trim(),
  );
}

test('each test article displays every catalog container requirement', () => {
  assert.equal(articles.length, catalog.length);
  for (const entry of catalog) {
    assert.deepEqual(
      containerEntries(testArticle(entry.code)),
      entry.containers_per_test.map(({ matrix, quantity, type }) => `${matrix}: ${quantity} × ${type}`),
      entry.code,
    );
  }
});

test('CHEM-ALT citation exposes the serum / 1 / SST requirement', () => {
  assert.ok(containerEntries(testArticle('CHEM-ALT')).includes('serum: 1 × SST'));
});

test('existing sample, result, and test citation IDs remain intact', () => {
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const expectedIds = [
    ...samples.flatMap(({ id }) => [
      `synthetic-sample-${id.toLowerCase()}`,
      `synthetic-results-${id.toLowerCase()}`,
    ]),
    ...catalog.map(({ code }) => `synthetic-test-${code.toLowerCase()}`),
  ];
  for (const id of expectedIds) {
    assert.equal(ids.filter((actual) => actual === id).length, 1, id);
  }
});
