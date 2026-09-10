'use client';

import { useState } from 'react';
import { AlertTriangle, Bot, CircuitBoard, ShieldCheck } from 'lucide-react';

type AssistantMode = 'expert' | 'discovery';

interface OHWorksAssistantResponse {
  answer: string;
  grounded: boolean;
  mode: AssistantMode;
  citations: Array<{ sourceId: string; recordId: string; corpusVersion: string }>;
  label: string;
  disposition: 'grounded' | 'refused' | 'evidence_missing' | 'render_blocked';
  refusalReason?: string;
  matchedClaimCategory?: string;
}

interface ChatItem {
  role: 'user' | 'assistant';
  text: string;
  response?: OHWorksAssistantResponse;
}

interface AssistantConsoleProps {
  roleId: string;
  roleLabel: string;
  roleNote: string;
  expertSuggestions: string[];
  discoverySuggestions: string[];
}

export function AssistantConsole({
  roleId,
  roleLabel,
  roleNote,
  expertSuggestions,
  discoverySuggestions,
}: AssistantConsoleProps) {
  const [mode, setMode] = useState<AssistantMode>('expert');
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    setPending(true);
    setInput('');
    try {
      const result = await fetch('/pilot/ohworks/bot/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: trimmed, roleId, mode }),
      });
      const reply = (await result.json()) as OHWorksAssistantResponse;
      setItems((previous) => [
        ...previous,
        { role: 'user', text: trimmed },
        { role: 'assistant', text: reply.answer, response: reply },
      ]);
    } catch {
      setItems((previous) => [
        ...previous,
        { role: 'user', text: trimmed },
        {
          role: 'assistant',
          text: 'The local synthetic assistant is unavailable. No result or integration action was attempted.',
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  const suggestions = mode === 'expert' ? expertSuggestions : discoverySuggestions;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[0.78fr_1.22fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Assistant mode</p>
          <div className="mt-4 grid gap-3">
            <button
              type="button"
              onClick={() => {
                setMode('expert');
                setItems([]);
                setInput('');
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                mode === 'expert'
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-slate-200 bg-slate-50 hover:border-teal-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-teal-700" />
                <span className="font-semibold">LIMS expert</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Deterministic synthetic workflow answers with stable source IDs and corpus metadata.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('discovery');
                setItems([]);
                setInput('');
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                mode === 'discovery'
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-slate-200 bg-slate-50 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <CircuitBoard className="h-4 w-4 text-amber-700" />
                <span className="font-semibold">Orchidlive discovery simulator</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Explicitly unverified LIAISON XL -&gt; Orchidlive -&gt; LIMS BOX hypothesis and supplier questions only.
              </p>
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current role view</p>
            <p className="mt-2 font-semibold text-slate-900">{roleLabel}</p>
            <p className="mt-2 text-xs leading-5 text-slate-600">{roleNote}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => ask(suggestion)}
                className="rounded-full border border-slate-200 px-3 py-2 text-left text-xs text-slate-700 transition hover:border-teal-500 hover:text-teal-700"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="mt-5 min-h-56 space-y-4" aria-live="polite">
            {items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                Synthetic demonstration data only. Ask one of the supported deterministic questions above.
              </div>
            )}

            {items.map((item, index) => (
              <div key={`${item.role}-${index}`} className={item.role === 'user' ? 'text-right' : 'text-left'}>
                <div
                  className={
                    item.role === 'user'
                      ? 'ml-auto max-w-[88%] rounded-2xl bg-slate-900 px-4 py-3 text-left text-sm text-white'
                      : 'max-w-[88%] rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-900'
                  }
                >
                  <p>{item.text}</p>
                  {item.response && (
                    <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-2 py-1 font-semibold text-slate-700 ring-1 ring-slate-200">
                          {item.response.label}
                        </span>
                        <span className="uppercase tracking-wide">{item.response.disposition}</span>
                        {item.response.refusalReason && <span>{item.response.refusalReason}</span>}
                        {item.response.matchedClaimCategory && <span>{item.response.matchedClaimCategory}</span>}
                      </div>
                      {item.response.citations.length > 0 ? (
                        <ul className="mt-3 space-y-1">
                          {item.response.citations.map((citation) => (
                            <li key={`${citation.recordId}-${citation.sourceId}`}>
                              source `{citation.sourceId}` · record `{citation.recordId}` · corpus `{citation.corpusVersion}`
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3">No approved source citation was emitted for this response.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask(input);
            }}
            className="mt-5 flex gap-2"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={mode === 'expert' ? 'Ask a supported synthetic workflow question...' : 'Ask a supported discovery question...'}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-transparent px-4 py-3 text-sm text-slate-900 outline-none focus:border-teal-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || pending}
              className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {pending ? 'Checking...' : 'Ask'}
            </button>
          </form>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2 text-emerald-900">
            <ShieldCheck className="h-5 w-5" />
            <h2 className="font-semibold">Deterministic guardrails</h2>
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-emerald-950">
            <li>Sources are admitted through the S1 source registry and only approved source IDs are used.</li>
            <li>Assistant record selection is filtered by exact tenant plus role data class before answer assembly.</li>
            <li>Commercial claims are filtered again immediately before render.</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="font-semibold">Required refusals</h2>
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-amber-950">
            <li>Clinical interpretation, diagnosis, patient-specific advice, and release actions are refused.</li>
            <li>Compliance, accreditation, live-integration, and configuration claims are refused.</li>
            <li>Prompt-injection attempts fail closed and emit no approved-source citations.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
