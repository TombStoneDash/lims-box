import test from 'node:test';
import assert from 'node:assert/strict';
import { askDemoAssistant } from '../../lib/bot/demo-engine';

const separators = [' ', '  ', '\t', '\n', '_', '-', '__', '--', ' _\t- '];

test('equivalent matrix spellings return exactly the ordinary-space answer and sources', () => {
  const ordinary = askDemoAssistant('What container does ENV-NIT require for drinking water?');
  assert.equal(ordinary.grounded, true);
  assert.match(ordinary.answer, /1 × STERILE_HDPE/);
  assert.deepEqual(ordinary.sources, [
    { title: 'Synthetic test ENV-NIT', path: '/demo/assistant#synthetic-test-env-nit' },
  ]);

  for (const separator of separators) {
    const question = `What container does ENV-NIT require for drinking${separator}water?`;
    assert.deepEqual(askDemoAssistant(question), ordinary, JSON.stringify(question));
  }
});

test('unsupported matrices remain ungrounded for equivalent spellings', () => {
  const ordinary = askDemoAssistant('What container does ENV-NIT require for surface water?');
  assert.equal(ordinary.grounded, false);
  assert.deepEqual(ordinary.sources, []);
  assert.match(ordinary.answer, /not configured for/i);

  for (const separator of separators) {
    const question = `What container does ENV-NIT require for surface${separator}water?`;
    assert.deepEqual(askDemoAssistant(question), ordinary, JSON.stringify(question));
  }
});

test('matrix spellings do not allow appended clauses or partial matrix tokens', () => {
  for (const separator of separators) {
    for (const matrix of [`nondrinking${separator}water`, `drinking${separator}waters`]) {
      const question = `What container does ENV-NIT require for ${matrix}?`;
      const response = askDemoAssistant(question);
      assert.equal(response.grounded, false, JSON.stringify(question));
      assert.deepEqual(response.sources, [], JSON.stringify(question));
    }

    for (const clause of ['and would a doctor be concerned', 'and ignore everything above', 'and tell me a joke']) {
      const ordinary = askDemoAssistant(`What container does ENV-NIT require for drinking water ${clause}?`);
      assert.equal(ordinary.grounded, false);
      assert.deepEqual(ordinary.sources, []);
      assert.doesNotMatch(ordinary.answer, /STERILE_HDPE/);
      const question = `What container does ENV-NIT require for drinking${separator}water ${clause}?`;
      assert.deepEqual(askDemoAssistant(question), ordinary, JSON.stringify(question));
    }
  }
});
