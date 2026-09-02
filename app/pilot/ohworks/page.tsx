import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cloud,
  FlaskConical,
  ListChecks,
  Users,
} from 'lucide-react';
import { discoveryGates, pilotMeta, readinessRows, workflowStages } from '@/lib/ohworks-pilot';

const cards = [
  {
    label: 'Planning volume',
    value: pilotMeta.annualVolumeRange,
    sub: 'samples/year · customer-reported range',
    icon: FlaskConical,
  },
  {
    label: 'Deployment direction',
    value: 'Cloud candidate',
    sub: 'provider and UK data location not selected',
    icon: Cloud,
  },
  {
    label: 'Instrument track',
    value: 'Discovery open',
    sub: 'exact analyzer, protocol, and mapping required',
    icon: Activity,
  },
  {
    label: 'Pilot users',
    value: 'Not named',
    sub: 'roles and least privilege remain discovery items',
    icon: Users,
  },
];

export default function OHWorksPilotOverview() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl bg-[#163642] text-white shadow-xl">
        <div className="grid gap-8 px-7 py-9 lg:grid-cols-[1.35fr_0.65fr] lg:px-10">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-teal-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-200 ring-1 ring-teal-200/20">
              <CheckCircle2 className="h-3.5 w-3.5" /> Local pilot shell
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
              Turn discovery into a controlled, evidence-backed pilot.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-200 sm:text-base">
              This workspace demonstrates the workflow shape without pretending the customer configuration is known.
              Every open clinical, instrument, security, and hosting decision stays visible until a named owner closes it.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/pilot/ohworks/samples" className="inline-flex items-center gap-2 rounded-xl bg-teal-300 px-4 py-2.5 text-sm font-semibold text-[#12232e] hover:bg-teal-200">
                Explore workflow <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/pilot/ohworks/audit" className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
                Review readiness gates
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">Current truth</p>
            <dl className="mt-5 space-y-5">
              <div>
                <dt className="text-xs text-slate-300">Workspace state</dt>
                <dd className="mt-1 font-semibold">{pilotMeta.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-300">Instrument</dt>
                <dd className="mt-1 text-sm leading-6">{pilotMeta.instrumentCandidate}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-300">Data boundary</dt>
                <dd className="mt-1 text-sm leading-6">{pilotMeta.dataClass}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{sub}</p>
              </div>
              <div className="rounded-xl bg-teal-50 p-2.5 text-teal-700"><Icon className="h-5 w-5" /></div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-teal-700" />
            <h2 className="text-lg font-semibold">End-to-end workflow contract</h2>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-5">
            {workflowStages.map((stage, index) => (
              <div key={stage.name} className="relative rounded-xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-xs font-bold text-teal-700">0{index + 1}</span>
                <h3 className="mt-2 text-sm font-semibold">{stage.name}</h3>
                <p className="mt-2 text-xs text-slate-500">{stage.owner}</p>
                <p className="mt-3 text-xs leading-5 text-slate-600">{stage.control}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Six decisions block a real pilot</h2>
          </div>
          <div className="mt-4 space-y-3">
            {discoveryGates.map((gate) => (
              <div key={gate.area} className="rounded-xl bg-white/70 p-3 ring-1 ring-amber-200">
                <p className="text-sm font-semibold text-slate-900">{gate.area}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{gate.question}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Readiness matrix</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="py-3 pr-4">Capability</th><th className="py-3 pr-4">State</th><th className="py-3">Evidence</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {readinessRows.map((row) => (
                <tr key={row.capability}>
                  <td className="py-3 pr-4 font-medium">{row.capability}</td>
                  <td className="py-3 pr-4 text-slate-600">{row.state}</td>
                  <td className="py-3 text-slate-500">{row.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
