'use client';

import { useState, type FormEvent } from 'react';

interface Props {
  email: string;
  list: string;
}

type State = 'idle' | 'loading' | 'success' | 'error';

export default function UnsubscribeClient({ email, list }: Props) {
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [enteredEmail, setEnteredEmail] = useState('');
  const unsubscribeEmail = email || enteredEmail.trim();
  const canUnsubscribe = Boolean(email) || unsubscribeEmail.includes('@');

  const displayList = list === 'all' ? 'all LIMS BOX emails' : 'the LIMS BOX newsletter';

  async function handleUnsubscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUnsubscribe || state === 'loading' || !event.currentTarget.checkValidity()) return;
    setState('loading');
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: unsubscribeEmail, list }),
      });
      if (res.ok) {
        setState('success');
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg((data as { error?: string }).error || 'Something went wrong. Please try again.');
        setState('error');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setState('error');
    }
  }

  if (state === 'success') {
    return (
      <div role="status" className="text-center">
        <div className="text-4xl mb-4">✓</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">You&apos;re unsubscribed</h2>
        <p className="text-gray-600 text-sm">
          {unsubscribeEmail ? (
            <>
              <strong>{unsubscribeEmail}</strong> has been removed from {displayList}.
            </>
          ) : (
            <>You have been removed from {displayList}.</>
          )}
        </p>
        <p className="text-gray-400 text-xs mt-4">
          You won&apos;t receive further emails from this list. Changes may take up to 24 hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleUnsubscribe}>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        Unsubscribe from {displayList}
      </h2>

      {email ? (
        <p className="text-gray-600 text-sm mb-6">
          Click below to unsubscribe <strong>{email}</strong> from {displayList}.
        </p>
      ) : (
        <div className="mb-6">
          <p className="text-gray-600 text-sm mb-4">
            Enter your email address to unsubscribe from {displayList}.
          </p>
          <label htmlFor="unsubscribe-email" className="block text-sm font-medium text-gray-900 mb-2">
            Email address
          </label>
          <input
            id="unsubscribe-email"
            type="email"
            name="email"
            required
            autoComplete="email"
            maxLength={320}
            value={enteredEmail}
            onChange={(event) => setEnteredEmail(event.target.value)}
            disabled={state === 'loading'}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
      )}

      {state === 'error' && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={state === 'loading' || !canUnsubscribe}
        className="w-full bg-gray-900 text-white py-3 px-4 rounded-md font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {state === 'loading' ? 'Processing…' : 'Confirm Unsubscribe'}
      </button>

      <p className="text-xs text-gray-400 mt-4 text-center">
        Changed your mind?{' '}
        <a href="https://lims.bot" className="underline hover:text-gray-600">
          Visit LIMS BOX
        </a>
      </p>
    </form>
  );
}
