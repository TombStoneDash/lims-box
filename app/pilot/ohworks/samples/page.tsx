import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot } from 'lucide-react';
import { syntheticSamples, workflowStages } from '@/lib/ohworks-pilot';

const stateStyles: Record<string, string> = {
  Accessioned: 'bg-slate-100 text-slate-700 ring-slate-300',
  Queued: 'bg-sky-50 text-sky-700 ring-sky-200',
  'Instrument result': 'bg-violet-50 text-violet-700 ring-violet-200',
  'Technical review': 'bg-amber-50 text-amber-800 ring-amber-200',
  Released: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export default function OHWorksSampleWorkflow() {
  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Synthetic workflow</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Sample and result lifecycle</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Fictional records demonstrate separation between receipt, instrument ingestion, technical review, and release.
          No state shown here represents OHWorks production activity.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          {workflowStages.map((stage, index) => (
            <div key={stage.name} className="flex min-w-0 flex-1 items-center gap-3">
              <div className="h-full min-w-0 flex-1 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="flex items-center gap-2">
                  <CircleDot className="h-4 w-4 text-teal-600" />
                  <h2 className="text-sm font-semibold">{stage.name}</h2>
                </div>
                <p className="mt-2 text-xs text-slate-500">Owner: {stage.owner}</p>
                <p className="mt-3 text-xs leading-5 text-slate-600">{stage.control}</p>
              </div>
              {index < workflowStages.length - 1 && <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-300 lg:block" />}
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold">Synthetic work queue</h2>
            <p className="mt-1 text-xs text-slate-500">Five fixtures exercise every stage plus exception and human-review paths.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">No customer data</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Accession</th><th className="px-4 py-3">Panel</th><th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Instrument</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Review signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {syntheticSamples.map((sample) => (
                <tr key={sample.id}>
                  <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-900">{sample.id}</td>
                  <td className="px-4 py-4">{sample.panel}</td>
                  <td className="px-4 py-4 text-slate-500">{sample.received}</td>
                  <td className="px-4 py-4 text-slate-600">{sample.instrument}</td>
                  <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${stateStyles[sample.state]}`}>{sample.state}</span></td>
                  <td className="px-4 py-4 text-slate-600">{sample.flag}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2 text-emerald-800"><CheckCircle2 className="h-5 w-5" /><h2 className="font-semibold">Fail-safe controls shown</h2></div>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-emerald-950">
            <li>• Duplicate and replay detection precedes promotion.</li>
            <li>• Result ingestion and authorized release are separate states.</li>
            <li>• Every mapping revision is versioned and reviewable.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 text-amber-900"><AlertTriangle className="h-5 w-5" /><h2 className="font-semibold">Still requires discovery</h2></div>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-amber-950">
            <li>• Customer accession format, priorities, and test menu.</li>
            <li>• Reflex, repeat, dilution, and multi-component rules.</li>
            <li>• Review, authorization, amendment, and reporting policy.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
