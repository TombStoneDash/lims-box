import type { Metadata } from 'next';
import Link from 'next/link';
import {
  FIELD_SCOUT_DEMO_ASSETS,
  FIELD_SCOUT_EARLY_ADOPTER_URL,
} from '@/lib/fieldScout';

export const metadata: Metadata = {
  title: 'Field Scout for water labs — LIMS BOX',
  description:
    'A mock, human-reviewed field-to-bench workflow for authorized water and environmental laboratory asset capture.',
};

const workflow = [
  {
    title: 'Identify the authorized asset',
    body: 'Scan an approved NFC or QR tag assigned to a field meter, cooler, or sampling kit.',
  },
  {
    title: 'Draft the field record',
    body: 'Capture the asset, location, calibration context, and sample-handling note as a local draft.',
  },
  {
    title: 'Review before sync',
    body: 'A qualified operator reviews or corrects the draft before any record can enter a LIMS.',
  },
] as const;

export default function FieldScoutPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold">
            LIMS BOX
          </Link>
          <Link
            href="/environmental"
            className="text-sm text-emerald-800 hover:text-emerald-950"
          >
            Environmental labs
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
          Water and environmental workflow preview
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
          Keep field equipment context attached from sampling site to bench.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-700">
          Field Scout is a mock workflow for authorized asset identification,
          local draft capture, and human-reviewed transfer into a laboratory
          record. This preview contains no PHI and no production data.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={FIELD_SCOUT_EARLY_ADOPTER_URL}
            className="rounded-md bg-emerald-700 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Request a water-lab walkthrough
          </Link>
          <Link
            href="/senaite-demo"
            className="rounded-md border border-slate-300 px-6 py-3 text-sm font-semibold hover:border-slate-500"
          >
            View the SENAITE demo
          </Link>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-5xl gap-5 px-6 py-12 md:grid-cols-3">
          {workflow.map((step, index) => (
            <article
              key={step.title}
              className="rounded-lg border border-slate-200 bg-white p-5"
            >
              <p className="text-xs font-semibold text-emerald-800">
                Step {index + 1}
              </p>
              <h2 className="mt-2 text-lg font-semibold">{step.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {step.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="text-2xl font-semibold">Mock authorized registry</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          These examples are synthetic. They demonstrate the handoff shape
          without representing a real customer, facility, sample, or instrument.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {FIELD_SCOUT_DEMO_ASSETS.map((asset) => (
            <article
              key={asset.id}
              className="rounded-lg border border-slate-200 p-5"
            >
              <p className="font-mono text-xs text-emerald-800">{asset.id}</p>
              <h3 className="mt-2 font-semibold">{asset.name}</h3>
              <dl className="mt-4 space-y-2 text-sm">
                <div>
                  <dt className="text-slate-500">Mock location</dt>
                  <dd>{asset.location}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Draft status</dt>
                  <dd>{asset.status}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-emerald-950 text-white">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <h2 className="text-2xl font-semibold">Human approval is mandatory.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-emerald-50/80">
            Field Scout does not discover unauthorized equipment, make
            compliance decisions, interpret laboratory results, or write
            directly to a production LIMS. Every captured item remains a draft
            until an authorized operator reviews it.
          </p>
        </div>
      </section>
    </main>
  );
}
