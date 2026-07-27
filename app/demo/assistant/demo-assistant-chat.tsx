'use client';

import Link from 'next/link';
import { useState } from 'react';

interface BotSource {
  title: string;
  path: string;
}

interface BotReply {
  answer: string;
  grounded: boolean;
  sources: BotSource[];
}

interface ChatItem {
  role: 'user' | 'assistant';
  text: string;
  sources?: BotSource[];
}

const SUGGESTIONS = [
  'What is the status of SYN-26041-0001?',
  'What results are available for SYN-26041-0001?',
  'What is the TAT for SYN-26041-0001?',
  'What container does CHEM-ALT require for serum?',
  'How do I order CHEM-ALT for SYN-26041-0001?',
];

export function DemoAssistantChat() {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setInput('');
    setItems((previous) => [...previous, { role: 'user', text: trimmed }]);

    try {
      const response = await fetch('/api/demo/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      const data: BotReply | { error: string } = await response.json();
      setItems((previous) => [
        ...previous,
        {
          role: 'assistant',
          text: 'error' in data ? data.error : data.answer,
          sources: 'sources' in data ? data.sources : undefined,
        },
      ]);
    } catch {
      setItems((previous) => [
        ...previous,
        { role: 'assistant', text: 'The local demo could not answer. Try again.' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="mb-5 flex min-h-28 flex-col gap-4" aria-live="polite">
        {items.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => ask(suggestion)}
                className="rounded-full border border-slate-200 px-3 py-2 text-left text-xs text-slate-700 transition hover:border-teal-500 hover:text-teal-700 dark:border-white/10 dark:text-slate-200"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {items.map((item, index) => (
          <div key={`${item.role}-${index}`} className={item.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={
                item.role === 'user'
                  ? 'inline-block max-w-[88%] rounded-xl bg-slate-900 px-4 py-3 text-left text-sm text-white dark:bg-white dark:text-slate-900'
                  : 'inline-block max-w-[88%] rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-900 dark:bg-white/10 dark:text-white'
              }
            >
              <p>{item.text}</p>
              {item.sources && item.sources.length > 0 && (
                <div className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
                  <span className="font-semibold">Sources: </span>
                  {item.sources.map((source, sourceIndex) => (
                    <span key={`${source.path}-${source.title}`}>
                      {sourceIndex > 0 && ' · '}
                      <Link href={source.path} className="underline hover:text-teal-600">
                        {source.title}
                      </Link>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && <p className="text-xs text-slate-400">Checking synthetic records…</p>}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          maxLength={500}
          placeholder="Ask about a synthetic sample or test…"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-transparent px-4 py-3 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-white/10 dark:text-white"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
