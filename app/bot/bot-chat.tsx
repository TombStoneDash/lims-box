'use client';

import { useState } from 'react';
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
}

interface ChatItem {
  role: 'user' | 'bot';
  text: string;
  sources?: BotSource[];
  followUp?: { label: string; path: string };
}

const SUGGESTIONS = [
  'What does LIMS BOX cost?',
  'Does LIMS BOX work offline?',
  'How long does setup take?',
];

export function BotChat() {
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
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data: BotReply | { error: string } = await res.json();
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
          },
        ]);
      }
    } catch {
      setItems((prev) => [
        ...prev,
        { role: 'bot', text: 'Connection problem — please try again.' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
      <div className="space-y-4 mb-4 min-h-24">
        {items.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="text-sm px-3 py-1.5 rounded-full border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-slate-400"
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
              <p>{item.text}</p>
              {item.sources && item.sources.length > 0 && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Sources:{' '}
                  {item.sources.map((s, j) => (
                    <span key={s.path + j}>
                      {j > 0 && ' · '}
                      <Link href={s.path} className="underline">
                        {s.title}
                      </Link>
                    </span>
                  ))}
                </p>
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
            </div>
          </div>
        ))}
        {busy && <p className="text-xs text-slate-400">Thinking…</p>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder="Ask about LIMS BOX…"
          className="flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-slate-400"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-40"
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
