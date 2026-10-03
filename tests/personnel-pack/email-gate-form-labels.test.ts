import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  EmailGateFeedback,
  EmailGateForm,
} from '../../app/personnel-pack/EmailGateForm';

test('the e-mail input has a visible label pointing at it and carries the right attributes', () => {
  const markup = renderToStaticMarkup(React.createElement(EmailGateForm));

  assert.match(markup, /<label for="personnel-pack-email"[^>]*>Work e-mail<\/label>/);

  const inputMatch = markup.match(/<input[^>]*id="personnel-pack-email"[^>]*>/);
  assert.ok(inputMatch, 'expected an <input> carrying id="personnel-pack-email"');
  const input = inputMatch![0];
  assert.match(input, /type="email"/);
  assert.match(input, /autocomplete="email"/i);
  assert.match(input, /required=""|required(?!=)/);
});

test('the pack picker has a visible label pointing at it', () => {
  const markup = renderToStaticMarkup(React.createElement(EmailGateForm));

  assert.match(markup, /<label for="personnel-pack-choice"[^>]*>/);

  const selectMatch = markup.match(/<select[^>]*id="personnel-pack-choice"[^>]*>/);
  assert.ok(selectMatch, 'expected a <select> carrying id="personnel-pack-choice"');
});

test('every input and select in the default markup has an id that some label points at', () => {
  const markup = renderToStaticMarkup(React.createElement(EmailGateForm));

  const labelForTargets = new Set<string>();
  const labelRe = /<label[^>]*\sfor="([^"]+)"/g;
  let labelMatch: RegExpExecArray | null;
  while ((labelMatch = labelRe.exec(markup)) !== null) {
    labelForTargets.add(labelMatch[1]);
  }

  const controlRe = /<(input|select)\b[^>]*>/g;
  let controlMatch: RegExpExecArray | null;
  while ((controlMatch = controlRe.exec(markup)) !== null) {
    const tag = controlMatch[0];
    const idMatch = tag.match(/\sid="([^"]+)"/);
    assert.ok(idMatch, `expected an id attribute on: ${tag}`);
    assert.ok(
      labelForTargets.has(idMatch![1]),
      `expected a <label for="${idMatch![1]}"> matching: ${tag}`,
    );
  }
});

test('the form is described by the existing help note via aria-describedby', () => {
  const markup = renderToStaticMarkup(React.createElement(EmailGateForm));

  assert.match(markup, /<form[^>]*aria-describedby="personnel-pack-form-note"/);
  assert.match(markup, /id="personnel-pack-form-note"/);
});

test('default render still shows no status/alert region', () => {
  const markup = renderToStaticMarkup(React.createElement(EmailGateForm));

  assert.doesNotMatch(markup, /role="alert"/);
  assert.doesNotMatch(markup, /role="status"/);
});

test('EmailGateFeedback renders readable text-sm sizing, not text-xs, for both message kinds', () => {
  const unavailableMarkup = renderToStaticMarkup(
    React.createElement(EmailGateFeedback, { state: { kind: 'unavailable', message: 'x' } }),
  );
  assert.match(unavailableMarkup, /role="alert"/);
  assert.match(unavailableMarkup, /text-sm/);
  assert.doesNotMatch(unavailableMarkup, /text-xs/);

  const pendingMarkup = renderToStaticMarkup(
    React.createElement(EmailGateFeedback, { state: { kind: 'pending', message: 'x' } }),
  );
  assert.match(pendingMarkup, /role="status"/);
  assert.match(pendingMarkup, /text-sm/);

  const formMarkup = renderToStaticMarkup(
    React.createElement(EmailGateFeedback, { state: { kind: 'form' } }),
  );
  assert.equal(formMarkup, '');
});
