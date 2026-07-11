import type { Metadata } from 'next';
import { BotChat } from './bot-chat';

export const metadata: Metadata = {
  title: 'LIMS BOT (Prototype) — LIMS BOX',
  description:
    'Ask LIMS BOT about LIMS BOX. Answers come only from published LIMS BOX documentation, with sources.',
  robots: { index: false, follow: false },
};

export default function BotPage() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          LIMS BOT <span className="text-sm font-medium text-slate-500 align-middle">prototype</span>
        </h1>
        <p className="text-slate-600 dark:text-slate-300 mb-8 text-sm">
          Answers come only from published LIMS BOX documentation and always cite
          their source. If the documentation doesn&apos;t cover it, LIMS BOT says so
          instead of guessing.
        </p>
        <BotChat />
      </div>
    </main>
  );
}
