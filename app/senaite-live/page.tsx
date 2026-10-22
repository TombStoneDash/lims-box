import type { Metadata } from 'next';

import { createSenaiteReadAdapter } from '@/lib/senaite-read';
import { senaiteLiveView, type SenaiteLiveTone } from '@/lib/senaite-read/view';

export const metadata: Metadata = {
  title: 'Live SENAITE samples — LIMS BOX',
  robots: { index: false, follow: false },
};

// Every request reads SENAITE again; nothing is cached or prerendered at build time.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const TONE_CLASSES: Record<SenaiteLiveTone, string> = {
  ok: 'border-emerald-300 bg-emerald-50 text-emerald-950',
  empty: 'border-slate-300 bg-slate-50 text-slate-900',
  unavailable: 'border-amber-300 bg-amber-50 text-amber-950',
  error: 'border-red-300 bg-red-50 text-red-950',
};

/**
 * Server-rendered, read-only list of the newest samples in the configured
 * SENAITE. Protected by the operator Basic-auth middleware. The token stays on
 * the server; every outcome other than a proven sign-in renders an explicit
 * unavailable state, never synthetic data.
 */
export default async function SenaiteLivePage() {
  const view = senaiteLiveView(await createSenaiteReadAdapter().listSamples({ limit: 25 }));

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live SENAITE · read-only</p>
        <h1 className="mt-1 text-2xl font-bold">SENAITE samples</h1>

        <section
          className={`mt-6 rounded border px-4 py-3 ${TONE_CLASSES[view.tone]}`}
          role={view.tone === 'error' ? 'alert' : 'status'}
          data-senaite-state={view.tone}
        >
          <h2 className="font-semibold">{view.heading}</h2>
          <p className="mt-1 text-sm">{view.detail}</p>
        </section>

        {view.rows.length > 0 && (
          <table className="mt-6 w-full border-collapse text-sm">
            <caption className="sr-only">Newest SENAITE samples</caption>
            <thead>
              <tr className="border-b border-slate-300 text-left">
                <th scope="col" className="py-2 pr-4">Sample ID</th>
                <th scope="col" className="py-2 pr-4">Title</th>
                <th scope="col" className="py-2">State</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map(row => (
                <tr key={row.uid} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-mono">{row.id}</td>
                  <td className="py-2 pr-4">{row.title ?? '—'}</td>
                  <td className="py-2">{row.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
