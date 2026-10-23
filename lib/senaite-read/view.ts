import type { SenaiteReadErrorCode, SenaiteReadResult, SenaiteSample } from './index';

export type SenaiteLiveTone = 'ok' | 'empty' | 'unavailable' | 'error';

export type SenaiteLiveRow = {
  uid: string;
  id: string;
  title: string | null;
  state: string;
};

export type SenaiteLiveView = {
  tone: SenaiteLiveTone;
  heading: string;
  detail: string;
  rows: SenaiteLiveRow[];
};

// SENAITE 2.6 sample (AnalysisRequest) workflow states.
const REVIEW_STATE_LABELS: Record<string, string> = {
  sample_registered: 'Registered',
  scheduled_sampling: 'Sampling scheduled',
  to_be_sampled: 'To be sampled',
  sample_due: 'Due',
  sample_received: 'Received',
  to_be_preserved: 'To be preserved',
  to_be_verified: 'To be verified',
  verified: 'Verified',
  published: 'Published',
  invalid: 'Invalid',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  stored: 'Stored',
  dispatched: 'Dispatched',
};

export function reviewStateLabel(state: string | null): string {
  if (state === null) return 'State not reported';
  return Object.hasOwn(REVIEW_STATE_LABELS, state) ? REVIEW_STATE_LABELS[state] : state;
}

// Fixed wording per code: nothing from the upstream response reaches the page.
const ERROR_COPY: Record<SenaiteReadErrorCode, { heading: string; detail: string }> = {
  unauthenticated: {
    heading: 'SENAITE did not accept the read token',
    detail: 'SENAITE answered as an anonymous visitor, so no samples were requested. ' +
      'This is not an empty lab. Replace the read-only token, then reload.',
  },
  'request-failed': {
    heading: 'SENAITE could not be reached',
    detail: 'The request failed, timed out, or SENAITE returned an HTTP error. No samples are shown.',
  },
  'invalid-response': {
    heading: 'SENAITE sent an answer this page cannot trust',
    detail: 'The response was not the expected SENAITE JSON API shape, so nothing from it is shown.',
  },
  'invalid-query': {
    heading: 'The sample request was not valid',
    detail: 'The page asked for samples in a form the adapter refuses. Nothing was sent to SENAITE.',
  },
  'tenant-mismatch': {
    heading: 'SENAITE returned samples from another client',
    detail: 'At least one sample did not belong to this client, so the whole page was withheld. No samples are shown.',
  },
};

function row(sample: SenaiteSample): SenaiteLiveRow {
  return { uid: sample.uid, id: sample.id, title: sample.title, state: reviewStateLabel(sample.reviewState) };
}

/** Maps every adapter outcome to an explicit page state; there is no synthetic fallback. */
export function senaiteLiveView(result: SenaiteReadResult): SenaiteLiveView {
  switch (result.status) {
    case 'not_configured':
      return {
        tone: 'unavailable',
        heading: 'SENAITE is not connected',
        detail: 'Set SENAITE_BASE_URL (HTTPS site root) and a read-only SENAITE_API_TOKEN on the server. ' +
          'Until both are set, this page makes no request and shows no data.',
        rows: [],
      };
    case 'error':
      return { tone: 'error', ...ERROR_COPY[result.code], rows: [] };
    case 'ok':
      if (result.samples.length === 0) {
        return {
          tone: 'empty',
          heading: 'No samples in SENAITE',
          detail: 'SENAITE confirmed the read token and returned no samples.',
          rows: [],
        };
      }
      return {
        tone: 'ok',
        heading: `${result.samples.length} newest SENAITE ${result.samples.length === 1 ? 'sample' : 'samples'}`,
        detail: 'Read live from SENAITE after it confirmed the read token. Newest first; one page only.',
        rows: result.samples.map(row),
      };
  }
}
