import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/demo/assistant/route';
import {
  askDemoAssistant,
  DEMO_MAX_REQUEST_BYTES,
  DEMO_SAMPLE_ID,
} from '../../lib/bot/demo-engine';

function streamRequest(body: ReadableStream<Uint8Array>) {
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    duplex: 'half',
  };
  return new NextRequest('http://localhost/api/demo/assistant', init);
}

async function assertResponse(
  stream: ReadableStream<Uint8Array>,
  status: number,
  expectedBody: unknown,
) {
  const request = streamRequest(stream);
  const response = await POST(request);
  assert.equal(response.status, status);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Content-Type') ?? '', /^application\/json\b/);
  assert.deepEqual(await response.json(), expectedBody);
  assert.equal(request.body!.locked, false);
  assert.equal(stream.locked, false);
}

test('immediate body stream failure returns a non-sensitive JSON 400', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error('sensitive transport details'));
    },
  });
  await assertResponse(stream, 400, { error: 'Unable to read request body.' });
});

test('body stream failure after a partial read returns a non-sensitive JSON 400', async () => {
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulls++ === 0) {
        controller.enqueue(new TextEncoder().encode('{"question":"status'));
      } else {
        controller.error(new Error('sensitive mid-body transport details'));
      }
    },
  });
  await assertResponse(stream, 400, { error: 'Unable to read request body.' });
  assert.equal(pulls, 2);
});

test('oversized body remains a JSON 413 when stream cancellation rejects', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(DEMO_MAX_REQUEST_BYTES + 1));
    },
    cancel() {
      cancelled = true;
      return Promise.reject(new Error('sensitive cancellation details'));
    },
  });
  await assertResponse(stream, 413, {
    error: `Request body exceeds ${DEMO_MAX_REQUEST_BYTES} bytes.`,
  });
  assert.equal(cancelled, true);
});

test('valid streamed body preserves the assistant JSON response', async () => {
  const question = `What is the status of ${DEMO_SAMPLE_ID}?`;
  const encoded = new TextEncoder().encode(JSON.stringify({ question }));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded.slice(0, 12));
      controller.enqueue(encoded.slice(12));
      controller.close();
    },
  });
  await assertResponse(stream, 200, askDemoAssistant(question));
});
