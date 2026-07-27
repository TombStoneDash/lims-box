import type { Metadata } from 'next';
import Link from 'next/link';
import { DemoAssistantChat } from './demo-assistant-chat';
import { DemoEvidenceLibrary } from './demo-evidence-library';

export const metadata: Metadata = {
  title: 'Grounded Assistant Demo — LIMS BOX',
  description: 'A read-only assistant grounded in fabricated synthetic LIMS records.',
  robots: { index: false, follow: false },
};

export default function DemoAssistantPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl">
        <Link href="/demo" className="text-sm font-medium text-teal-700 hover:underline dark:text-teal-400">
          ← Back to demo
        </Link>

        <div className="mb-8 mt-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-400">
            Read-only synthetic environment
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
            Grounded lab assistant
          </h1>
          <p className="mt-4 max-w-2xl text-slate-600 dark:text-slate-300">
            Ask five routine staff questions against deterministic fabricated records. Every factual answer
            cites its synthetic source. The assistant refuses PHI, clinical interpretation, compliance
            attestation, and any request to write an order.
          </p>
        </div>

        <DemoAssistantChat />

        <DemoEvidenceLibrary />

        <p className="mt-6 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          No patient, client, or production data is used. This route is a product demonstration, not a clinical
          system and not a compliance certification.
        </p>
      </div>
    </main>
  );
}
