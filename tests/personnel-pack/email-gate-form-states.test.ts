import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  classifyFailureKind,
  createEmailGateController,
  EmailGateForm,
  type EmailGateState,
} from '../../app/personnel-pack/EmailGateForm';

const CANARY_EMAIL = 'canary-applicant@example.com';

function fakeFetch(status: number, body: unknown, ok = status >= 200 && status < 300) {
  let calls = 0;
  const impl = async () => {
    calls += 1;
    return {
      ok,
      status,
      json: async () => body,
    } as unknown as Response;
  };
  return { impl, calls: () => calls };
}

function deferredFetch() {
  let calls = 0;
  let resolveCall: ((response: Response) => void) | null = null;
  const impl = () =>
    new Promise<Response>((resolve) => {
      calls += 1;
      resolveCall = resolve;
    });
  return {
    impl,
    calls: () => calls,
    resolve(status: number, body: unknown) {
      const ok = status >= 200 && status < 300;
      resolveCall!({ ok, status, json: async () => body } as unknown as Response);
    },
  };
}

// --- classifyFailureKind -----------------------------------------------------------------

test('classifyFailureKind maps only the known accepted-but-unfulfillable code to pending', () => {
  assert.equal(classifyFailureKind(409, 'unsupported_pack_selection'), 'pending');
});

test('classifyFailureKind fails closed to unavailable for every other status/code pairing', () => {
  const cases: Array<[number, string | undefined]> = [
    [400, 'invalid_email'],
    [400, 'invalid_request'],
    [503, 'asset_unavailable'],
    [503, 'lead_store_failed'],
    [503, 'operator_notice_failed'],
    [409, 'some_future_code'],
    [500, undefined],
  ];
  for (const [status, code] of cases) {
    assert.equal(classifyFailureKind(status, code), 'unavailable', `${status}/${code}`);
  }
});

// --- state coverage ------------------------------------------------------------------------

test('configured-download success state carries the delivery payload untouched', async () => {
  const delivery = {
    assetUrl: 'https://lims.bot/personnel-pack-assets/iso-15189-personnel-pack-v1-5.pdf',
    emailed: true,
    label: 'ISO 15189 Personnel Pack v1.5',
  };
  const { impl } = fakeFetch(200, { success: true, saved: true, delivery });
  const controller = createEmailGateController(impl as unknown as typeof fetch);

  const final = await controller.submit({ email: CANARY_EMAIL, accredType: 'iso15189' });

  assert.deepEqual(final, { kind: 'success', delivery });
  assert.deepEqual(controller.getState(), final);
});

test('pending-fulfillment state is reached for the known 409 unsupported-selection code', async () => {
  const { impl } = fakeFetch(409, {
    error: 'Automatic fulfillment is currently available only for the reviewed ISO 15189 pack.',
    code: 'unsupported_pack_selection',
  });
  const controller = createEmailGateController(impl as unknown as typeof fetch);

  const final = await controller.submit({ email: CANARY_EMAIL, accredType: 'clia' });

  assert.equal(final.kind, 'pending');
  assert.equal(
    (final as { message: string }).message,
    'Automatic fulfillment is currently available only for the reviewed ISO 15189 pack.',
  );
});

test('unavailable/misconfigured state is reached for a 503 asset/lead/notice failure', async () => {
  for (const code of ['asset_unavailable', 'lead_store_failed', 'operator_notice_failed']) {
    const { impl } = fakeFetch(503, {
      error: 'Automatic fulfillment is temporarily unavailable. Email info@lims.bot directly.',
      code,
    });
    const controller = createEmailGateController(impl as unknown as typeof fetch);

    const final = await controller.submit({ email: CANARY_EMAIL, accredType: 'iso15189' });

    assert.equal(final.kind, 'unavailable', code);
    assert.equal(
      (final as { message: string }).message,
      'Automatic fulfillment is temporarily unavailable. Email info@lims.bot directly.',
      code,
    );
  }
});

test('unavailable state falls back to a fixed generic message when the error body is unusable', async () => {
  const { impl } = fakeFetch(500, {});
  const controller = createEmailGateController(impl as unknown as typeof fetch);

  const final = await controller.submit({ email: CANARY_EMAIL, accredType: 'iso15189' });

  assert.deepEqual(final, {
    kind: 'unavailable',
    message: 'Something went wrong. Email info@lims.bot directly.',
  });
});

test('unavailable state is reached on a network/fetch rejection with a fixed message', async () => {
  const impl = async () => {
    throw new Error('fetch failed');
  };
  const controller = createEmailGateController(impl as unknown as typeof fetch);

  const final = await controller.submit({ email: CANARY_EMAIL, accredType: 'iso15189' });

  assert.deepEqual(final, {
    kind: 'unavailable',
    message: 'Network error. Email info@lims.bot directly.',
  });
});

// --- duplicate-submit prevention -----------------------------------------------------------

test('a second submit while one is in flight performs no second network call and emits no second submitting transition', async () => {
  const deferred = deferredFetch();
  const controller = createEmailGateController(deferred.impl as unknown as typeof fetch);
  const seen: EmailGateState[] = [];
  controller.subscribe((state) => seen.push(state));

  const first = controller.submit({ email: CANARY_EMAIL, accredType: 'iso15189' });
  assert.equal(controller.isSubmitting(), true);
  // A duplicate call while in flight must be a no-op: it is guarded before any await, so it
  // resolves immediately with the *current* (still-submitting) state rather than waiting for
  // the in-flight request to settle.
  const second = await controller.submit({ email: CANARY_EMAIL, accredType: 'iso15189' });

  assert.equal(deferred.calls(), 1, 'duplicate submit must not issue a second request');
  assert.deepEqual(second, { kind: 'submitting' }, 'a blocked duplicate must not fabricate a settled result');
  assert.deepEqual(
    seen.filter((s) => s.kind === 'submitting'),
    [{ kind: 'submitting' }],
    'duplicate submit must not re-emit a second submitting transition',
  );

  deferred.resolve(200, { delivery: { assetUrl: 'x', emailed: false, label: 'x' } });
  const firstResult = await first;
  assert.deepEqual(firstResult, { kind: 'success', delivery: { assetUrl: 'x', emailed: false, label: 'x' } });
});

// --- safe retry ------------------------------------------------------------------------------

test('retrying the very same controller instance after failure clears the prior message', async () => {
  let call = 0;
  const impl = async () => {
    call += 1;
    if (call === 1) {
      return {
        ok: false,
        status: 503,
        json: async () => ({
          error: 'Automatic fulfillment is temporarily unavailable. Email info@lims.bot directly.',
          code: 'asset_unavailable',
        }),
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        saved: true,
        delivery: { assetUrl: 'https://lims.bot/x.pdf', emailed: true, label: 'ISO 15189 Personnel Pack v1.5' },
      }),
    } as unknown as Response;
  };
  const controller = createEmailGateController(impl as unknown as typeof fetch);

  const first = await controller.submit({ email: CANARY_EMAIL, accredType: 'iso15189' });
  assert.equal(first.kind, 'unavailable');

  const second = await controller.submit({ email: CANARY_EMAIL, accredType: 'iso15189' });
  assert.equal(second.kind, 'success');
  assert.equal(call, 2, 'retry after failure must issue a fresh request, not replay the cached failure');
});

// --- no applicant PII in rendered errors ----------------------------------------------------

test('pending and unavailable state messages never contain the submitted email, regardless of transport payload', async () => {
  const pendingFetch = fakeFetch(409, {
    error: 'Automatic fulfillment is currently available only for the reviewed ISO 15189 pack.',
    code: 'unsupported_pack_selection',
  });
  const pendingController = createEmailGateController(pendingFetch.impl as unknown as typeof fetch);
  const pending = await pendingController.submit({ email: CANARY_EMAIL, accredType: 'clia' });

  const unavailableFetch = fakeFetch(503, {
    error: 'Automatic fulfillment is temporarily unavailable. Email info@lims.bot directly.',
    code: 'asset_unavailable',
  });
  const unavailableController = createEmailGateController(unavailableFetch.impl as unknown as typeof fetch);
  const unavailable = await unavailableController.submit({ email: CANARY_EMAIL, accredType: 'iso15189' });

  for (const state of [pending, unavailable]) {
    assert.doesNotMatch(JSON.stringify(state), new RegExp(CANARY_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('the success state never embeds the submitted email in its delivery payload', async () => {
  const delivery = { assetUrl: 'https://lims.bot/x.pdf', emailed: true, label: 'ISO 15189 Personnel Pack v1.5' };
  const { impl } = fakeFetch(200, { success: true, saved: true, delivery });
  const controller = createEmailGateController(impl as unknown as typeof fetch);

  const final = await controller.submit({ email: CANARY_EMAIL, accredType: 'iso15189' });

  assert.doesNotMatch(JSON.stringify(final), new RegExp(CANARY_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

// --- component smoke test (React.createElement, no JSX) ------------------------------------

test('default render shows the form, not a status/alert region, and no disabled controls', () => {
  const markup = renderToStaticMarkup(React.createElement(EmailGateForm));

  assert.match(markup, /<form/);
  assert.doesNotMatch(markup, /role="status"/);
  assert.doesNotMatch(markup, /role="alert"/);
  assert.doesNotMatch(markup, /disabled=""/);
  assert.doesNotMatch(markup, /aria-busy="true"/);
});
