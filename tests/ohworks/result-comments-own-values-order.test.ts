import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CommentRenderError,
  renderResultComment,
  renderResultComments,
  type CommentCodeDefinition,
  type ResultCommentRequest,
} from '../../lib/ohworks-result-comments';

function tableFor(placeholder: string): CommentCodeDefinition[] {
  return [{ code: 'NOTE', template: `Note: {${placeholder}}`, placeholders: [placeholder], maxLength: 80, priority: 1 }];
}

function assertErrorCode(render: () => unknown, code: string): void {
  assert.throws(render, (error: unknown) => error instanceof CommentRenderError && error.code === code);
}

for (const placeholder of ['constructor', 'toString', '__proto__']) {
  test(`inherited ${placeholder} is not a supplied placeholder value`, () => {
    const table = tableFor(placeholder);
    assertErrorCode(() => renderResultComment(table, { code: 'NOTE', values: {} }), 'missing-placeholder-value');

    const inherited = Object.create({ [placeholder]: 'inherited' }) as Record<string, string>;
    assertErrorCode(() => renderResultComment(table, { code: 'NOTE', values: inherited }), 'missing-placeholder-value');
  });

  test(`own string ${placeholder} renders, including a null-prototype value map`, () => {
    const table = tableFor(placeholder);
    const values = Object.create(null) as Record<string, string>;
    values[placeholder] = '  supplied  ';
    assert.equal(renderResultComment(table, { code: 'NOTE', values }).text, 'Note: supplied');

    const plainValues = {} as Record<string, string>;
    Object.defineProperty(plainValues, placeholder, { value: 'plain', enumerable: true });
    assert.equal(renderResultComment(table, { code: 'NOTE', values: plainValues }).text, 'Note: plain');
  });

  test(`own non-string ${placeholder} is a typed malformed request`, () => {
    const values = Object.create(null) as Record<string, unknown>;
    values[placeholder] = 42;
    const request = { code: 'NOTE', values } as unknown as ResultCommentRequest;
    assertErrorCode(() => renderResultComment(tableFor(placeholder), request), 'request-malformed');

    const nonEnumerable = {} as Record<string, string>;
    Object.defineProperty(nonEnumerable, placeholder, { value: 42 });
    assertErrorCode(
      () => renderResultComment(tableFor(placeholder), { code: 'NOTE', values: nonEnumerable }),
      'request-malformed',
    );
  });
}

test('same-code comments have one order across request permutations and retain duplicates', () => {
  const table = tableFor('detail');
  const requests: ResultCommentRequest[] = [
    { code: 'NOTE', values: { detail: 'a' } },
    { code: 'NOTE', values: { detail: 'Z' } },
    { code: 'NOTE', values: { detail: 'a' } },
  ];
  const expected = ['Note: Z', 'Note: a', 'Note: a'];
  const permutations = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2],
    [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];
  const reference = renderResultComments(table, requests);

  for (const indexes of permutations) {
    const rendered = renderResultComments(table, indexes.map((index) => requests[index]));
    assert.deepEqual(rendered, reference);
    assert.deepEqual(rendered.map((comment) => comment.text), expected);
    assert.equal(rendered.length, requests.length);
  }
});
