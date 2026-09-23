import test from 'node:test';
import assert from 'node:assert/strict';
import { askDemoAssistant } from '../../lib/bot/demo-engine';

const separators = [' ', '  ', '\t', ' \t ', '_', '-', ' _-\t-__ ', '\n', '\u00a0', ', '];
const matrices = ['drinking_water', 'surface_water'];

function question(testCode: string, matrix: string): string {
  return `What container does ${testCode} require for ${matrix}?`;
}

for (const matrix of matrices) {
  test(`${matrix} separator variants return the same canonical container answer`, () => {
    const expected = askDemoAssistant(question('ENV-PH', matrix.replace('_', ' ')));
    assert.deepEqual(expected, {
      answer: `ENV-PH for ${matrix} requires 1 × STERILE_HDPE in the synthetic catalog.`,
      grounded: true,
      sources: [{ title: 'Synthetic test ENV-PH', path: '/demo/assistant#synthetic-test-env-ph' }],
    });

    for (const separator of separators) {
      const input = question('ENV-PH', matrix.replace('_', separator));
      assert.deepEqual(askDemoAssistant(input), expected, JSON.stringify(input));
    }
  });

  test(`${matrix} separator variants preserve unsupported test/matrix responses`, () => {
    const testCode = matrix === 'drinking_water' ? 'ENV-MET-B' : 'ENV-NIT';
    const expected = {
      answer: `${testCode} is not configured for ${matrix} in the synthetic catalog.`,
      grounded: false,
      sources: [],
    };
    for (const separator of separators) {
      const input = question(testCode, matrix.replace('_', separator));
      assert.deepEqual(askDemoAssistant(input), expected, JSON.stringify(input));
    }
  });

  test(`${matrix} separator variants cannot authorize an appended unsafe clause`, () => {
    for (const separator of separators) {
      const input = `${question('ENV-PH', matrix.replace('_', separator))} and would a doctor be concerned`;
      assert.deepEqual(askDemoAssistant(input), {
        answer: 'This demo only answers questions about the displayed synthetic sample IDs and synthetic test codes.',
        grounded: false,
        sources: [],
      }, JSON.stringify(input));
    }
  });

  test(`${matrix} requires whole words and accepted separators`, () => {
    for (const spelling of [
      `extra${matrix}`, `${matrix}extra`, `_${matrix}`, `${matrix}_`,
      matrix.replace('_', ''), matrix.replace('_', '/'), matrix.replace('_', ':'),
    ]) {
      const input = question('ENV-PH', spelling);
      assert.deepEqual(askDemoAssistant(input), {
        answer: 'This demo only answers questions about the displayed synthetic sample IDs and synthetic test codes.',
        grounded: false,
        sources: [],
      }, input);
    }
  });
}
