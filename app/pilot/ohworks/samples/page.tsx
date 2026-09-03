import { AlertTriangle, CheckCircle2, Lock, ShieldOff } from 'lucide-react';
import {
  getVisibleWorkflowCards,
  resolveRoleView,
  workflowStages,
} from '@/lib/ohworks-pilot';

interface PageProps {
  searchParams?: Promise<{ role?: string }>;
}

const stateStyles: Record<string, string> = {
  Accessioned: 'bg-slate-100 text-slate-700 ring-slate-300',
  Queued: 'bg-sky-50 text-sky-700 ring-sky-200',
  'Instrument result': 'bg-violet-50 text-violet-700 ring-violet-200',
  Quarantined: 'bg-rose-50 text-rose-700 ring-rose-200',
  'Technical review': 'bg-amber-50 text-amber-800 ring-amber-200',
  Released: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export default async function OHWorksSampleWorkflow({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const role = resolveRoleView(params?.role);
  const visibleCards = getVisibleWorkflowCards(role.id);
  const canSeeClinical = ['reviewer', 'admin'].includes(role.id);

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Synthetic demonstration data only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">OHWorks sample and result lifecycle</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          The workflow reducer is fail-closed: ingestion can produce only Instrument result or Quarantined,
          and release is impossible without a distinct authorized technical-review event.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {workflowStages.map((stage) => (
            <div key={stage.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-sm font-semibold">{stage.name}</h2>
              <p className="mt-2 text-xs text-slate-500">{stage.owner}</p>
              <p className="mt-3 text-xs leading-5 text-slate-600">{stage.control}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="font-semibold">Role-filtered synthetic work queue</h2>
            <p className="mt-1 text-xs text-slate-500">
              Current role: {role.label}. Outcome-only roles never receive analyte values or clinical flags.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {role.note}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {visibleCards.map((sample) => (
            <article key={sample.sampleId} className="grid gap-5 px-6 py-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-mono text-sm font-semibold text-slate-950">{sample.sampleId}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${stateStyles[sample.state]}`}>
                    {sample.state}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {sample.visibleDataClasses.join(', ')}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-slate-900">{sample.panel}</p>
                <p className="mt-2 text-sm text-slate-600">{sample.summary}</p>
                <dl className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Received</dt>
                    <dd className="mt-1">{sample.receivedAt}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Instrument track</dt>
                    <dd className="mt-1">{sample.instrumentLabel}</dd>
                  </div>
                </dl>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2">
                    {canSeeClinical ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4 text-slate-500" />}
                    <h4 className="text-sm font-semibold">Clinical-detail panel</h4>
                  </div>
                  {sample.clinicalLines.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                      {sample.clinicalLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      {canSeeClinical
                        ? 'No structured synthetic analytes are available for this sample.'
                        : 'Hidden for this role. Employer and worker views do not expose analyte values or clinical flags.'}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2">
                    {sample.reviewLocked ? <ShieldOff className="h-4 w-4 text-amber-700" /> : <CheckCircle2 className="h-4 w-4 text-teal-700" />}
                    <h4 className="text-sm font-semibold">Review and release controls</h4>
                  </div>
                  {sample.adminLines.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                      {sample.adminLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      {sample.reviewLocked
                        ? 'This role cannot review or release. The simulator keeps those controls server-unproven and visually locked.'
                        : 'No extra admin trail is available for this state.'}
                    </p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 className="h-5 w-5" />
            <h2 className="font-semibold">Happy path proof points</h2>
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-emerald-950">
            <li>Release occurs only on the sample already in Technical review.</li>
            <li>Worker and employer views stay read-only and outcome-only.</li>
            <li>Every ingest event records stable message, parser, and mapping IDs.</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="font-semibold">Quarantine proof points</h2>
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-amber-950">
            <li>Unknown mappings stop in Quarantined and are never guessed.</li>
            <li>Malformed payloads can move only to Quarantined and then to Technical review if an authorized reviewer acknowledges them.</li>
            <li>Queued, Instrument result, and Quarantined states cannot be released directly.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
