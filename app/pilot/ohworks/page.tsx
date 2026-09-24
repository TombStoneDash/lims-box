import { buildPilotQualityIndicatorsView } from '@/lib/ohworks-demo-quality-indicators-view';
import { FacilityReadinessPanel } from '@/app/pilot/ohworks/_components/facility-readiness-panel';
import Link from 'next/link';
import { ArrowRight, Bot, Filter, ShieldAlert, Waypoints } from 'lucide-react';
import {
  getVisibleAudit,
  getVisibleDiscoveryRecords,
  getVisiblePersonnel,
  getVisibleWorkflowCards,
  pilotMeta,
  readinessRows,
  resolveRoleView,
  workflowStages,
} from '@/lib/ohworks-pilot';

interface PageProps {
  searchParams?: Promise<{ role?: string }>;
}

export default async function OHWorksPilotOverview({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const role = resolveRoleView(params?.role);
  const visibleWorkflow = getVisibleWorkflowCards(role.id);
  const visiblePersonnel = getVisiblePersonnel(role.id);
  const visibleAudit = getVisibleAudit(role.id);
  const visibleDiscovery = getVisibleDiscoveryRecords(role.id);

  const quality = buildPilotQualityIndicatorsView();

  const cards = [
    {
      label: 'Active synthetic role view',
      value: role.label,
      sub: role.note,
      icon: Filter,
    },
    {
      label: 'Visible workflow records',
      value: String(visibleWorkflow.length),
      sub: 'Role-filtered sample cards in the OHWorks demo tenant',
      icon: Waypoints,
    },
    {
      label: 'Visible personnel records',
      value: String(visiblePersonnel.length),
      sub: 'Admin-only synthetic personnel evidence when permitted',
      icon: ShieldAlert,
    },
    {
      label: 'Visible audit events',
      value: String(visibleAudit.length),
      sub: 'Role-filtered synthetic evidence only',
      icon: Bot,
    },
  ];

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] bg-[#163642] text-white shadow-xl">
        <div className="grid gap-8 px-7 py-9 lg:grid-cols-[1.35fr_0.65fr] lg:px-10">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-teal-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-200 ring-1 ring-teal-200/20">
              Synthetic demonstration data only
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
              Controlled OHWorks workflow demo with explicit discovery boundaries.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-200 sm:text-base">
              This local slice proves a fail-closed synthetic workflow, role-filtered views, and a deterministic
              OHWorks assistant. It does not prove live compatibility, deployment, validation, or customer acceptance.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={`/pilot/ohworks/samples?role=${role.id}`}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-300 px-4 py-2.5 text-sm font-semibold text-[#12232e] hover:bg-teal-200"
              >
                Review workflow <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={`/pilot/ohworks/bot?role=${role.id}`}
                className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Open expert assistant
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">Current truth</p>
            <dl className="mt-5 space-y-5 text-sm">
              <div>
                <dt className="text-xs text-slate-300">Workspace state</dt>
                <dd className="mt-1 font-semibold">{pilotMeta.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-300">Instrument path</dt>
                <dd className="mt-1 leading-6">{pilotMeta.instrumentCandidate}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-300">Corpus and versions</dt>
                <dd className="mt-1 leading-6">
                  {pilotMeta.corpusVersion}
                  <br />
                  parser {pilotMeta.parserVersionId} / mapping {pilotMeta.mappingVersionId}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-300">Discovery questions visible</dt>
                <dd className="mt-1 font-semibold">{visibleDiscovery.length}</dd>
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
              <div className="rounded-xl bg-teal-50 p-2.5 text-teal-700">
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Workflow contract</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {workflowStages.map((stage, index) => (
              <div key={stage.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-xs font-bold text-teal-700">0{index + 1}</span>
                <h3 className="mt-2 text-sm font-semibold">{stage.name}</h3>
                <p className="mt-2 text-xs text-slate-500">{stage.owner}</p>
                <p className="mt-3 text-xs leading-5 text-slate-600">{stage.control}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-950">Discovery stays open on purpose</h2>
          <div className="mt-4 space-y-3">
            {visibleDiscovery.slice(0, 4).map((gate) => (
              <div key={gate.id} className="rounded-xl bg-white/80 p-4 ring-1 ring-amber-200">
                <p className="text-sm font-semibold text-slate-900">{gate.area}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{gate.question}</p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-amber-800">{gate.owner}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Synthetic demonstration data only</p>
        <h2 className="mt-2 text-lg font-semibold">Monthly quality indicators and proficiency testing (fabricated month)</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {quality.period}: a fabricated month evaluated by the real rule modules. All values, targets, windows and
          event limits shown are fabricated examples, not benchmarks or regulatory limits. No real SENAITE server
          or customer data is behind this panel. The same synthetic content is shown for every role.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {quality.indicators.map((row) => (
            <div key={row.label} className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold">{row.label}</h3>
              <span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-semibold ${row.meetsTarget === null ? 'bg-slate-100 text-slate-700' : row.meetsTarget ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-800'}`}>{row.status}</span>
              <p className="mt-2 text-sm">Synthetic rate: {row.rate} ({row.numerator}/{row.denominator})</p>
              <p className="mt-1 text-xs text-slate-600">Fabricated target: {row.target} · {row.direction} is better</p>
              {row.ratePercent !== null && (
                <div aria-hidden="true" className="relative mt-3 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-teal-500" style={{ width: `${row.ratePercent}%` }} />
                  <span className="absolute -top-1 h-4 border-l-2 border-slate-700" style={{ left: `${row.targetPercent}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Synthetic bars show rate on a 0–100% scale; the dark marker shows the fabricated target. No bar is shown for an unmeasurable period.</p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="mb-3 text-left font-semibold">Fabricated proficiency-testing events — every value and outcome is synthetic</caption>
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr><th scope="col" className="p-2">Synthetic event / consensus</th><th scope="col" className="p-2">Assigned / SD</th><th scope="col" className="p-2">Satisfactory / questionable / unsatisfactory</th><th scope="col" className="p-2">Satisfactory rate</th><th scope="col" className="p-2">Outcome / reasons</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {quality.ptEvents.map((event) => (
                <tr key={event.label}>
                  <td className="p-2">{event.label}<br />{event.consensusSource}</td>
                  <td className="p-2">{event.assignedValue} / {event.standardDeviation}</td>
                  <td className="p-2">{event.satisfactoryCount} / {event.questionableCount} / {event.unsatisfactoryCount}</td>
                  <td className="p-2">{event.satisfactoryRate}</td>
                  <td className="p-2"><span className="font-semibold">{event.outcome}</span>{event.failReasonExplanations.map((reason) => <p key={reason} className="mt-1 text-xs text-slate-600">{reason}</p>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {quality.ptEvents.map((event) => (
          <details key={event.label} className="mt-4 rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-teal-800">{event.label}: fabricated participant scores</summary>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              {event.participantScores.map((score) => <li key={score.participantId}>{score.participantId}: synthetic z-score {score.zScore} · {score.classification}. {score.explanation}</li>)}
            </ul>
          </details>
        ))}
      </section>

      <FacilityReadinessPanel />

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Readiness matrix</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Capability</th>
                  <th className="py-3 pr-4">State</th>
                  <th className="py-3">Evidence</th>
                </tr>
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
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Why the role filter matters</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
            <li>Employer and worker roles are restricted to outcome-only records in the OHWorks demo tenant.</li>
            <li>Reviewer and admin roles can also see clinical-detail and admin evidence, but only inside the same synthetic tenant.</li>
            <li>The assistant uses the same filter before assembling a response, so employer views never receive analyte values or clinical flags.</li>
            <li>Visible personnel records: {visiblePersonnel.length}. Visible audit records: {visibleAudit.length}.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
