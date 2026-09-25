'use client';

import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface DeliveryState {
  assetUrl: string;
  emailed: boolean;
  label: string;
}

/**
 * Explicit, mutually exclusive UI states for the gate form. `pending` covers a selection the
 * server accepted the request format for but cannot fulfill automatically (e.g. an
 * unsupported pack choice); `unavailable` covers everything else that failed — validation,
 * a misconfigured/broken asset, storage, notice, or network failure. Neither ever carries the
 * applicant's email: only the server's pre-sanitized message string is stored.
 */
export type EmailGateState =
  | { kind: 'form' }
  | { kind: 'submitting' }
  | { kind: 'success'; delivery: DeliveryState }
  | { kind: 'pending'; message: string }
  | { kind: 'unavailable'; message: string };

const GENERIC_UNAVAILABLE_MESSAGE = 'Something went wrong. Email info@lims.bot directly.';
const NETWORK_UNAVAILABLE_MESSAGE = 'Network error. Email info@lims.bot directly.';
const UNSUPPORTED_PACK_MESSAGE =
  'Automatic fulfillment is currently available only for the reviewed ISO 15189 pack.';
const FULFILLMENT_UNAVAILABLE_MESSAGE =
  'Automatic fulfillment is temporarily unavailable. Email info@lims.bot directly.';

/** Only the one known "accepted but not fulfillable" code counts as pending; everything else fails closed to unavailable. */
export function classifyFailureKind(status: number, code: unknown): 'pending' | 'unavailable' {
  return status === 409 && code === 'unsupported_pack_selection' ? 'pending' : 'unavailable';
}

/**
 * Fixed, pre-approved copy for every known status/code pairing. The server's own `error` text,
 * response body, and any other request-derived value are never used as rendered copy — an
 * unrecognized pairing always falls back to the generic message rather than surfacing anything
 * server-supplied.
 */
const KNOWN_FAILURE_MESSAGES: Record<string, string> = {
  '409:unsupported_pack_selection': UNSUPPORTED_PACK_MESSAGE,
  '503:asset_unavailable': FULFILLMENT_UNAVAILABLE_MESSAGE,
  '503:lead_store_failed': FULFILLMENT_UNAVAILABLE_MESSAGE,
  '503:operator_notice_failed': FULFILLMENT_UNAVAILABLE_MESSAGE,
};

function safeFailureMessage(status: number, code: unknown): string {
  const key = `${status}:${typeof code === 'string' ? code : ''}`;
  return KNOWN_FAILURE_MESSAGES[key] ?? GENERIC_UNAVAILABLE_MESSAGE;
}

/**
 * Framework-free controller for the gate form's submit lifecycle: owns the in-flight guard so
 * duplicate submits (double-click, double Enter) never issue a second request, and exposes
 * state via subscribe() so it is testable without rendering React or touching a DOM.
 */
export function createEmailGateController(fetchImpl: typeof fetch = fetch) {
  let state: EmailGateState = { kind: 'form' };
  let inFlight = false;
  const listeners = new Set<(state: EmailGateState) => void>();

  function emit(next: EmailGateState) {
    state = next;
    listeners.forEach((listener) => listener(state));
  }

  return {
    getState(): EmailGateState {
      return state;
    },
    subscribe(listener: (state: EmailGateState) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isSubmitting(): boolean {
      return inFlight;
    },
    async submit(input: { email: string; accredType: string }): Promise<EmailGateState> {
      if (inFlight) return state;
      inFlight = true;
      emit({ kind: 'submitting' });
      try {
        const res = await fetchImpl('/api/personnel-pack-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (res.ok) {
          const data = (await res.json()) as { delivery: DeliveryState };
          emit({ kind: 'success', delivery: data.delivery });
          return state;
        }
        const data = (await res.json().catch(() => ({}))) as { code?: string };
        const message = safeFailureMessage(res.status, data.code);
        emit({ kind: classifyFailureKind(res.status, data.code), message });
        return state;
      } catch {
        emit({ kind: 'unavailable', message: NETWORK_UNAVAILABLE_MESSAGE });
        return state;
      } finally {
        inFlight = false;
      }
    },
  };
}

/** Renders the pending/unavailable feedback surface for a given state, or nothing otherwise. Only the fixed, pre-approved `state.message` is ever shown — never raw server payloads. */
export function EmailGateFeedback({ state }: { state: EmailGateState }) {
  if (state.kind === 'pending') {
    return (
      <p role="status" aria-live="polite" className="text-amber-300 text-sm">
        {state.message}
      </p>
    );
  }
  if (state.kind === 'unavailable') {
    return (
      <p role="alert" aria-live="assertive" className="text-red-300 text-sm">
        {state.message}
      </p>
    );
  }
  return null;
}

export function EmailGateForm() {
  const [email, setEmail] = useState('');
  const [accredType, setAccredType] = useState('');
  const [controller] = useState(() => createEmailGateController());
  const [state, setState] = useState<EmailGateState>(() => controller.getState());

  useEffect(() => controller.subscribe(setState), [controller]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await controller.submit({ email, accredType });
  }

  const submitting = state.kind === 'submitting';

  return (
    <section className="px-4 pb-10">
      <div className="max-w-2xl mx-auto bg-white/5 border border-[#2E8B57]/30 rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-2 mb-2">
          <Download className="w-5 h-5 text-[#2E8B57] flex-shrink-0" />
          <h2 className="text-lg font-semibold text-white">
            Get the Personnel Pack PDF — Free
          </h2>
        </div>
        <p className="text-sm text-slate-400 mb-5 leading-relaxed">
          Survey-ready templates for ISO&nbsp;15189&nbsp;§6.2 and CLIA&nbsp;§493.1407.
          Printable, no login required. Built by a lab informaticist who&apos;s been through
          the inspection.
        </p>

        {state.kind === 'success' ? (
          <div
            role="status"
            aria-live="polite"
            className="bg-[#2E8B57]/10 border border-[#2E8B57]/30 rounded-lg px-4 py-3"
          >
            <p className="text-[#2E8B57] font-medium text-sm">
              ✓ Your reviewed pack is ready now.
            </p>
            <a
              href={state.delivery.assetUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#2E8B57] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2E8B57]/90 transition-colors"
            >
              Download {state.delivery.label} →
            </a>
            <p className="mt-3 text-xs text-slate-400">
              {state.delivery.emailed
                ? 'A copy was also emailed to you.'
                : 'Email delivery is unavailable right now, so this page is your fulfillment path.'}
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3"
            aria-describedby="personnel-pack-form-note"
          >
            <div>
              <label
                htmlFor="personnel-pack-email"
                className="block text-sm font-medium text-slate-200 mb-1"
              >
                Work e-mail
              </label>
              <input
                id="personnel-pack-email"
                name="email"
                type="email"
                required
                placeholder="your@lab.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                autoComplete="email"
                inputMode="email"
                className="bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-sm
                           text-white placeholder:text-slate-500 focus:outline-none
                           focus:border-[#2E8B57]/60 w-full disabled:opacity-60"
              />
            </div>
            <div>
              <label
                htmlFor="personnel-pack-choice"
                className="block text-sm font-medium text-slate-200 mb-1"
              >
                Which pack do you need?
              </label>
              <select
                id="personnel-pack-choice"
                name="accredType"
                required
                value={accredType}
                onChange={(e) => setAccredType(e.target.value)}
                disabled={submitting}
                className="bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-sm
                           text-slate-300 focus:outline-none focus:border-[#2E8B57]/60 w-full
                           appearance-none disabled:opacity-60"
              >
                <option value="">Select your pack</option>
                <option value="iso15189">ISO 15189 pack (reviewed)</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="bg-[#2E8B57] hover:bg-[#2E8B57]/90 disabled:opacity-60
                         text-white font-semibold px-6 py-2.5 rounded-lg text-sm
                         transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? 'Sending…' : 'Send me the PDF →'}
            </button>

            <EmailGateFeedback state={state} />

            <p id="personnel-pack-form-note" className="text-xs text-slate-500">
              No phone required. No spam. Unsubscribe anytime.
            </p>
            <p className="text-xs text-slate-500">
              Automatic fulfillment is currently available only for the reviewed ISO 15189 pack.
              Need COLA, CAP, CLIA, or another framework? Email{' '}
              <a href="mailto:info@lims.bot" className="underline hover:text-slate-300">
                info@lims.bot
              </a>{' '}
              and we&apos;ll follow up directly — those packs aren&apos;t reviewed for automatic
              delivery yet.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
