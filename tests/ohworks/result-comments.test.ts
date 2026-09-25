import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CommentRenderError,
  explainCommentRenderError,
  isDeclaredCommentCode,
  renderResultComment,
  renderResultComments,
  type CommentCodeDefinition,
  type CommentRenderErrorCode,
  type CommentTable,
  type ResultCommentRequest,
} from '../../lib/ohworks-result-comments';

/**
 * All fabricated: synthetic comment codes, template text, and placeholder
 * values. None of this represents a real subject, sample, or result.
 */
function baselineTable(): CommentCodeDefinition[] {
  return [
    {
      code: 'DILUTION-APPLIED',
      template: 'Result diluted {factor}x prior to analysis by {analyst}.',
      placeholders: ['factor', 'analyst'],
      maxLength: 80,
      priority: 10,
    },
    {
      code: 'HOLD-TIME-EXCEEDED',
      template: 'Sample exceeded holding time by {hours} hours.',
      placeholders: ['hours'],
      maxLength: 60,
      priority: 5,
      // Note: intentionally out-of-numeric-order relative to DILUTION-APPLIED
      // to exercise priority-based sorting below.
    },
    {
      code: 'MATRIX-INTERFERENCE',
      template: 'Matrix interference noted; no analyst input required.',
      placeholders: [],
      maxLength: 60,
      priority: 5,
    },
  ];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const ALL_ERROR_CODES: CommentRenderErrorCode[] = [
  'table-not-array',
  'table-empty',
  'table-entry-malformed',
  'table-duplicate-code',
  'table-placeholder-invalid',
  'table-placeholder-duplicate',
  'table-template-placeholder-mismatch',
  'requests-not-array',
  'request-malformed',
  'unknown-code',
  'missing-placeholder-value',
  'empty-placeholder-value',
  'unexpected-placeholder-value',
  'rendered-comment-too-long',
];

function assertThrowsCode(fn: () => unknown, code: CommentRenderErrorCode): void {
  assert.throws(
    fn,
    (error: unknown) => {
      assert.ok(error instanceof CommentRenderError);
      assert.equal((error as CommentRenderError).code, code);
      return true;
    },
  );
}

test('renders a comment substituting every declared placeholder', () => {
  const table = baselineTable();
  const request: ResultCommentRequest = {
    code: 'DILUTION-APPLIED',
    values: { factor: '10', analyst: 'A. Synth' },
  };
  const result = renderResultComment(table, request);
  assert.equal(result.code, 'DILUTION-APPLIED');
  assert.equal(result.priority, 10);
  assert.equal(result.text, 'Result diluted 10x prior to analysis by A. Synth.');
});

test('renders a comment with no placeholders at all', () => {
  const table = baselineTable();
  const result = renderResultComment(table, { code: 'MATRIX-INTERFERENCE', values: {} });
  assert.equal(result.text, 'Matrix interference noted; no analyst input required.');
});

test('placeholder values are trimmed before substitution', () => {
  const table = baselineTable();
  const result = renderResultComment(table, {
    code: 'HOLD-TIME-EXCEEDED',
    values: { hours: '  6  ' },
  });
  assert.equal(result.text, 'Sample exceeded holding time by 6 hours.');
});

test('rendering is pure: it does not mutate the table or request', () => {
  const table = baselineTable();
  const request: ResultCommentRequest = { code: 'HOLD-TIME-EXCEEDED', values: { hours: '6' } };
  const tableBefore = JSON.stringify(table);
  const requestBefore = JSON.stringify(request);
  renderResultComment(table, request);
  assert.equal(JSON.stringify(table), tableBefore);
  assert.equal(JSON.stringify(request), requestBefore);
});

test('rendering is deterministic across repeated calls', () => {
  const table = baselineTable();
  const request: ResultCommentRequest = { code: 'DILUTION-APPLIED', values: { factor: '2', analyst: 'B. Synth' } };
  const first = renderResultComment(clone(table), clone(request));
  const second = renderResultComment(clone(table), clone(request));
  assert.deepEqual(first, second);
});

test('the rendered comment is frozen', () => {
  const table = baselineTable();
  const result = renderResultComment(table, { code: 'MATRIX-INTERFERENCE', values: {} });
  assert.ok(Object.isFrozen(result));
});

test('an unknown code fails closed', () => {
  const table = baselineTable();
  assertThrowsCode(() => renderResultComment(table, { code: 'NOT-DECLARED', values: {} }), 'unknown-code');
});

test('free text is never accepted as a comment: an arbitrary string is not a declared code', () => {
  const table = baselineTable();
  assert.equal(isDeclaredCommentCode(table, 'The analyst noted an anomaly.'), false);
  assertThrowsCode(
    () => renderResultComment(table, { code: 'The analyst noted an anomaly.', values: {} }),
    'unknown-code',
  );
});

test('isDeclaredCommentCode is true only for codes present in the table', () => {
  const table = baselineTable();
  assert.equal(isDeclaredCommentCode(table, 'DILUTION-APPLIED'), true);
  assert.equal(isDeclaredCommentCode(table, 'dilution-applied'), false);
  assert.equal(isDeclaredCommentCode(table, 42), false);
});

test('a missing placeholder value fails closed', () => {
  const table = baselineTable();
  assertThrowsCode(
    () => renderResultComment(table, { code: 'DILUTION-APPLIED', values: { factor: '10' } }),
    'missing-placeholder-value',
  );
});

test('a blank placeholder value fails closed', () => {
  const table = baselineTable();
  assertThrowsCode(
    () => renderResultComment(table, { code: 'HOLD-TIME-EXCEEDED', values: { hours: '   ' } }),
    'empty-placeholder-value',
  );
});

test('a non-string placeholder value fails closed as a malformed request', () => {
  const table = baselineTable();
  const request = { code: 'HOLD-TIME-EXCEEDED', values: { hours: 6 } } as unknown as ResultCommentRequest;
  assertThrowsCode(() => renderResultComment(table, request), 'request-malformed');
});

test('a value supplied for an undeclared placeholder fails closed', () => {
  const table = baselineTable();
  assertThrowsCode(
    () => renderResultComment(table, { code: 'HOLD-TIME-EXCEEDED', values: { hours: '6', extra: 'nope' } }),
    'unexpected-placeholder-value',
  );
});

test('a rendered comment within the declared maximum length passes', () => {
  const table = baselineTable();
  const result = renderResultComment(table, { code: 'HOLD-TIME-EXCEEDED', values: { hours: '6' } });
  assert.ok(result.text.length <= 60);
});

test('a rendered comment exceeding the declared maximum length fails closed', () => {
  const table = baselineTable();
  const longValue = 'X'.repeat(200);
  assertThrowsCode(
    () => renderResultComment(table, { code: 'HOLD-TIME-EXCEEDED', values: { hours: longValue } }),
    'rendered-comment-too-long',
  );
});

test('a rendered comment exactly at the declared maximum length passes', () => {
  const table: CommentCodeDefinition[] = [
    { code: 'EXACT-FIT', template: '{value}', placeholders: ['value'], maxLength: 5, priority: 0 },
  ];
  const result = renderResultComment(table, { code: 'EXACT-FIT', values: { value: 'abcde' } });
  assert.equal(result.text, 'abcde');
});

test('a rendered comment one character past the declared maximum length fails closed', () => {
  const table: CommentCodeDefinition[] = [
    { code: 'EXACT-FIT', template: '{value}', placeholders: ['value'], maxLength: 5, priority: 0 },
  ];
  assertThrowsCode(
    () => renderResultComment(table, { code: 'EXACT-FIT', values: { value: 'abcdef' } }),
    'rendered-comment-too-long',
  );
});

test('a placeholder referenced twice in the same template is substituted at every occurrence', () => {
  const table: CommentCodeDefinition[] = [
    {
      code: 'REPEAT-NAME',
      template: '{name} confirmed by {name}.',
      placeholders: ['name'],
      maxLength: 60,
      priority: 0,
    },
  ];
  const result = renderResultComment(table, { code: 'REPEAT-NAME', values: { name: 'A. Synth' } });
  assert.equal(result.text, 'A. Synth confirmed by A. Synth.');
});

test('multiple applicable comments render in deterministic priority-then-code order', () => {
  const table = baselineTable();
  const requests: ResultCommentRequest[] = [
    { code: 'DILUTION-APPLIED', values: { factor: '10', analyst: 'A. Synth' } },
    { code: 'HOLD-TIME-EXCEEDED', values: { hours: '6' } },
    { code: 'MATRIX-INTERFERENCE', values: {} },
  ];
  const result = renderResultComments(table, requests);
  assert.deepEqual(
    result.map((r) => r.code),
    ['HOLD-TIME-EXCEEDED', 'MATRIX-INTERFERENCE', 'DILUTION-APPLIED'],
  );
});

test('rendered comment order is independent of request submission order', () => {
  const table = baselineTable();
  const forward: ResultCommentRequest[] = [
    { code: 'DILUTION-APPLIED', values: { factor: '10', analyst: 'A. Synth' } },
    { code: 'HOLD-TIME-EXCEEDED', values: { hours: '6' } },
    { code: 'MATRIX-INTERFERENCE', values: {} },
  ];
  const reversed = [...forward].reverse();
  const resultForward = renderResultComments(table, forward);
  const resultReversed = renderResultComments(table, reversed);
  assert.deepEqual(resultForward, resultReversed);
});

test('the rendered comment list is frozen', () => {
  const table = baselineTable();
  const result = renderResultComments(table, [{ code: 'MATRIX-INTERFERENCE', values: {} }]);
  assert.ok(Object.isFrozen(result));
});

test('renderResultComments fails the whole call if any single request fails to render', () => {
  const table = baselineTable();
  const requests: ResultCommentRequest[] = [
    { code: 'MATRIX-INTERFERENCE', values: {} },
    { code: 'NOT-DECLARED', values: {} },
  ];
  assertThrowsCode(() => renderResultComments(table, requests), 'unknown-code');
});

test('a non-array requests argument fails closed', () => {
  const table = baselineTable();
  assertThrowsCode(
    () => renderResultComments(table, 'not-an-array' as unknown as ResultCommentRequest[]),
    'requests-not-array',
  );
});

test('a non-array table fails closed', () => {
  assertThrowsCode(
    () => renderResultComment('not-an-array' as unknown as CommentTable, { code: 'X', values: {} }),
    'table-not-array',
  );
});

test('an empty table fails closed', () => {
  assertThrowsCode(() => renderResultComment([], { code: 'X', values: {} }), 'table-empty');
});

test('a table entry missing a template field fails closed', () => {
  const table = [
    { code: 'BROKEN', placeholders: [], maxLength: 10, priority: 0 },
  ] as unknown as CommentCodeDefinition[];
  assertThrowsCode(() => renderResultComment(table, { code: 'BROKEN', values: {} }), 'table-entry-malformed');
});

test('a table entry with a non-positive maxLength fails closed', () => {
  const table: CommentCodeDefinition[] = [
    { code: 'BROKEN', template: 'fixed text', placeholders: [], maxLength: 0, priority: 0 },
  ];
  assertThrowsCode(() => renderResultComment(table, { code: 'BROKEN', values: {} }), 'table-entry-malformed');
});

test('a table entry with a non-integer priority fails closed', () => {
  const table = [
    { code: 'BROKEN', template: 'fixed text', placeholders: [], maxLength: 10, priority: 1.5 },
  ] as unknown as CommentCodeDefinition[];
  assertThrowsCode(() => renderResultComment(table, { code: 'BROKEN', values: {} }), 'table-entry-malformed');
});

test('duplicate declared codes in the table fail closed', () => {
  const table: CommentCodeDefinition[] = [
    { code: 'DUP', template: 'one', placeholders: [], maxLength: 10, priority: 0 },
    { code: 'DUP', template: 'two', placeholders: [], maxLength: 10, priority: 1 },
  ];
  assertThrowsCode(() => renderResultComment(table, { code: 'DUP', values: {} }), 'table-duplicate-code');
});

test('an invalid placeholder name in the table fails closed', () => {
  const table: CommentCodeDefinition[] = [
    { code: 'BAD-NAME', template: 'value: {bad name}', placeholders: ['bad name'], maxLength: 40, priority: 0 },
  ];
  assertThrowsCode(
    () => renderResultComment(table, { code: 'BAD-NAME', values: { 'bad name': 'x' } }),
    'table-placeholder-invalid',
  );
});

test('a duplicated placeholder name within one table entry fails closed', () => {
  const table: CommentCodeDefinition[] = [
    { code: 'DUP-PLACEHOLDER', template: '{name} {name}', placeholders: ['name', 'name'], maxLength: 40, priority: 0 },
  ];
  assertThrowsCode(
    () => renderResultComment(table, { code: 'DUP-PLACEHOLDER', values: { name: 'x' } }),
    'table-placeholder-duplicate',
  );
});

test('a template referencing an undeclared placeholder token fails closed', () => {
  const table: CommentCodeDefinition[] = [
    { code: 'MISMATCH', template: 'value: {value} and {extra}', placeholders: ['value'], maxLength: 60, priority: 0 },
  ];
  assertThrowsCode(
    () => renderResultComment(table, { code: 'MISMATCH', values: { value: 'x', extra: 'y' } }),
    'table-template-placeholder-mismatch',
  );
});

test('a declared placeholder never referenced by the template fails closed', () => {
  const table: CommentCodeDefinition[] = [
    { code: 'UNUSED', template: 'fixed text with no tokens', placeholders: ['value'], maxLength: 60, priority: 0 },
  ];
  assertThrowsCode(
    () => renderResultComment(table, { code: 'UNUSED', values: { value: 'x' } }),
    'table-template-placeholder-mismatch',
  );
});

test('a malformed request object fails closed', () => {
  const table = baselineTable();
  assertThrowsCode(
    () => renderResultComment(table, null as unknown as ResultCommentRequest),
    'request-malformed',
  );
  assertThrowsCode(
    () => renderResultComment(table, { code: '', values: {} }),
    'request-malformed',
  );
  assertThrowsCode(
    () => renderResultComment(table, { code: 'DILUTION-APPLIED', values: null } as unknown as ResultCommentRequest),
    'request-malformed',
  );
});

test('every error code has a non-empty, privacy-safe explanation', () => {
  for (const code of ALL_ERROR_CODES) {
    const message = explainCommentRenderError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});

test('a thrown error message never echoes submitted codes or values', () => {
  const table = baselineTable();
  try {
    renderResultComment(table, { code: 'TOP-SECRET-SYNTH-CODE', values: { leak: 'sensitive-synthetic-value' } });
    assert.fail('expected renderResultComment to throw');
  } catch (error) {
    assert.ok(error instanceof CommentRenderError);
    assert.doesNotMatch((error as Error).message, /TOP-SECRET-SYNTH-CODE|sensitive-synthetic-value/);
  }
});

test('explanations are stable across repeated calls for the same code', () => {
  assert.equal(explainCommentRenderError('unknown-code'), explainCommentRenderError('unknown-code'));
});
