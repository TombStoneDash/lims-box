'use client';

import React, { useId, useRef, useState } from 'react';
import Link from 'next/link';

interface BotSource {
  title: string;
  path: string;
}

interface BotReply {
  answer: string;
  grounded: boolean;
  sources: BotSource[];
  followUp?: { label: string; path: string };
  suggestions?: string[];
}

interface ChatItem {
  role: 'user' | 'bot';
  text: string;
  sources?: BotSource[];
  followUp?: { label: string; path: string };
  suggestions?: string[];
}

const SUGGESTIONS = [
  'What does LIMS BOX cost?',
  'Does LIMS BOX work offline?',
  'How long does setup take?',
];

export const BOT_REQUEST_TIMEOUT_MS = 15_000;

class BotRequestTimeoutError extends Error {
  constructor() {
    super('The request timed out — please try again.');
  }
}

export async function requestBotReply(question: string): Promise<BotReply | { error: string }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new BotRequestTimeoutError());
      controller.abort();
    }, BOT_REQUEST_TIMEOUT_MS);
  });

  try {
    // Race the entire response body too, even if abort does not settle it.
    return await Promise.race([
      (async () => {
        const res = await fetch('/api/bot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
          signal: controller.signal,
        });
        return await res.json();
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function BotChat() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput('');
    setItems((prev) => [...prev, { role: 'user', text: q }]);
    try {
      const data = await requestBotReply(q);
      if ('error' in data) {
        setItems((prev) => [...prev, { role: 'bot', text: data.error }]);
      } else {
        setItems((prev) => [
          ...prev,
          {
            role: 'bot',
            text: data.answer,
            sources: data.sources,
            followUp: data.followUp,
            suggestions: data.grounded ? undefined : data.suggestions,
          },
        ]);
      }
    } catch (error) {
      setItems((prev) => [
        ...prev,
        {
          role: 'bot',
          text: error instanceof BotRequestTimeoutError
            ? error.message
            : 'Connection problem — please try again.',
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
      <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation with LIMS BOT" aria-busy={busy} className="space-y-4 mb-4 min-h-24">
        {items.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  ask(s);
                  inputRef.current?.focus();
                }}
                disabled={busy}
                className="text-sm px-3 py-1.5 rounded-full border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {items.map((item, i) => (
          <div key={i} className={item.role === 'user' ? 'text-right' : ''}>
            <div
              className={
                item.role === 'user'
                  ? 'inline-block bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-lg px-3 py-2 text-sm max-w-[85%] text-left'
                  : 'inline-block bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm max-w-[85%]'
              }
            >
              <p><span className="sr-only">{item.role === 'user' ? 'You asked: ' : 'LIMS BOT answered: '}</span>{item.text}</p>
              {item.sources && item.sources.length > 0 && (
                <nav aria-label="Sources for this answer" className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Sources:{' '}
                  {item.sources.map((s, j) => (
                    <span key={s.path + j}>
                      {j > 0 && ' · '}
                      <Link href={s.path} className="underline">
                        {s.title}
                      </Link>
                    </span>
                  ))}
                </nav>
              )}
              {item.followUp && (
                <p className="mt-2">
                  <Link
                    href={item.followUp.path}
                    className="text-xs font-semibold underline"
                  >
                    {item.followUp.label} →
                  </Link>
                </p>
              )}
              {item.suggestions && item.suggestions.length > 0 && (
                <div role="group" aria-label="Try asking:" className="mt-2">
                  <p className="text-xs">Try asking:</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {item.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          ask(suggestion);
                          inputRef.current?.focus();
                        }}
                        disabled={busy}
                        className="rounded-sm text-left text-xs font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-40"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p role="status" className="text-xs text-slate-400">Thinking…</p>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2"
      >
        <label htmlFor={inputId} className="sr-only">Ask LIMS BOT a question</label>
        <input
          id={inputId}
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder="Ask about LIMS BOX…"
          className="flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Ask
        </button>
      </form>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        LIMS BOT is a prototype. It only answers from published LIMS BOX
        documentation and never stores your questions. For lab-specific
        guidance, <Link href="/contact" className="underline">contact the team</Link>.
      </p>
    </div>
  );
}
