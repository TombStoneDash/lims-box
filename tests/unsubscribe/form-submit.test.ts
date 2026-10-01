import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import UnsubscribeClient from '../../app/unsubscribe/UnsubscribeClient';

// tsx compiles this repository's preserved JSX in classic mode.
Object.assign(globalThis, { React });

const cases: Array<{ email: string; list: string }> = [
  { email: '', list: 'newsletter' },
  { email: 'person@example.com', list: 'all' },
];

for (const props of cases) {
  test(`unsubscribe form wraps the submit controls for props ${JSON.stringify(props)}`, () => {
    const markup = renderToStaticMarkup(React.createElement(UnsubscribeClient, props));

    const formMatches = markup.match(/<form/g) || [];
    assert.equal(formMatches.length, 1, 'expected exactly one <form');

    const formOpen = markup.indexOf('<form');
    const formClose = markup.indexOf('</form>');
    assert.ok(formOpen !== -1 && formClose !== -1, 'expected a <form>...</form> pair');

    const buttonIndex = markup.indexOf('Confirm Unsubscribe');
    assert.ok(buttonIndex > formOpen && buttonIndex < formClose, 'button must sit inside the form');

    const buttonTagStart = markup.lastIndexOf('<button', buttonIndex);
    const buttonTagEnd = markup.indexOf('>', buttonTagStart);
    const buttonTag = markup.slice(buttonTagStart, buttonTagEnd + 1);
    assert.ok(buttonTag.includes('type="submit"'), 'button must be type="submit"');

    const inputIndex = markup.indexOf('id="unsubscribe-email"');
    if (!props.email) {
      assert.ok(inputIndex !== -1, 'expected the email input when no email was supplied');
      assert.ok(inputIndex > formOpen && inputIndex < formClose, 'email input must sit inside the form');
      assert.ok(inputIndex < buttonTagStart, 'email input must come before the button');
    } else {
      assert.equal(inputIndex, -1, 'no email input expected when an email was supplied');
    }
  });
}

test('UnsubscribeClient.tsx source wires the form submit handler correctly', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../app/unsubscribe/UnsubscribeClient.tsx'),
    'utf8'
  );

  assert.ok(source.includes('onSubmit='), 'expected an onSubmit handler on the form');

  const handlerStart = source.indexOf('onSubmit=');
  const handlerBraceEnd = source.indexOf('}}', handlerStart);
  const handlerBody = source.slice(handlerStart, handlerBraceEnd + 2);
  const preventDefaultIndex = handlerBody.indexOf('preventDefault()');
  const handleUnsubscribeIndex = handlerBody.indexOf('handleUnsubscribe()');
  assert.ok(preventDefaultIndex !== -1, 'expected preventDefault() inside the submit handler');
  assert.ok(handleUnsubscribeIndex !== -1, 'expected handleUnsubscribe() inside the submit handler');
  assert.ok(
    preventDefaultIndex < handleUnsubscribeIndex,
    'preventDefault() must be called before handleUnsubscribe()'
  );

  assert.ok(!source.includes('onClick={handleUnsubscribe}'), 'button must no longer use onClick');
  assert.ok(!source.includes('text-gray-400'), 'fine print must no longer use text-gray-400');
});
