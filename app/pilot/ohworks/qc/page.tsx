import { buildPilotQcBracketLotView } from '@/lib/ohworks-demo-qc-bracket-lot-view';
import { Activity } from 'lucide-react';
import { buildPilotQcView } from '@/lib/ohworks-demo-qc-view';
import { resolveRoleView } from '@/lib/ohworks-pilot';
import { MethodPerformancePanel } from '@/app/pilot/ohworks/_components/method-performance-panel';

interface PageProps {
  searchParams?: Promise<{ role?: string }>;
}

const statusStyles = {
  accepted: 'bg-teal-50 text-teal-800',
  warning: 'bg-amber-50 text-amber-800',
  rejected: 'bg-rose-50 text-rose-800',
};

export default async function OHWorksQcReview({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const role = resolveRoleView(params?.role);
  const view = buildPilotQcView();
  const bracketLot = buildPilotQcBracketLotView();

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Synthetic demonstration data only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">QC review — Westgard multirule</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          The Westgard rules run for real on fabricated control values. In the demonstrated workflow, a rejected
          run blocks release pending human technical review. This read-only page does not connect to a SENAITE
          server or use customer data, and it cannot release results. Every value, timestamp and outcome shown
          belongs to the synthetic fixture; accepted means no rule fired with the available synthetic history,
          not permission to release.
        </p>
        <p className="mt-3 text-xs text-slate-500">Current role view: {role.label}. Every role sees the same synthetic QC review.</p>
      </div>

      <section aria-label="Synthetic run counts" className="grid gap-4 sm:grid-cols-3">
        {(['accepted', 'warning', 'rejected'] as const).map((status) => (
          <div key={status} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Synthetic runs — {status}</p>
            <p className="mt-2 text-3xl font-semibold">{view.counts[status]}</p>
          </div>
        ))}
      </section>

      {view.runs.map((run) => (
        <section key={run.runId} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Activity aria-hidden="true" className="h-5 w-5 text-teal-700" />
            <h2 className="font-mono text-lg font-semibold">{run.runId}</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[run.status]}`}>
              Synthetic run: {run.status}
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="pb-3 text-left text-xs text-slate-500">
                Fabricated control points. Synthetic SDI (standard deviation index) is rounded to two decimals.
              </caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Synthetic level</th>
                  <th scope="col" className="px-4 py-3">Fabricated timestamp (UTC)</th>
                  <th scope="col" className="px-4 py-3">Fabricated value</th>
                  <th scope="col" className="px-4 py-3">Synthetic SDI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {run.points.map((point) => (
                  <tr key={point.levelId}>
                    <th scope="row" className="px-4 py-4 font-mono text-xs font-semibold">{point.levelId}</th>
                    <td className="px-4 py-4 text-xs text-slate-600">{point.timestamp}</td>
                    <td className="px-4 py-4 tabular-nums">{point.value}</td>
                    <td className="px-4 py-4 tabular-nums">{point.sdi.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {run.firedRules.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Why this run was rejected/warned</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {run.firedRules.map((rule, index) => (
                  <li key={`${rule.code}-${index}`}>
                    <span className="font-mono font-semibold text-slate-900">{rule.code}</span>
                    {' '}({rule.severity}) — {rule.explanation}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-600">No rule fired for this fabricated run with the available synthetic history.</p>
          )}
        </section>
      ))}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">QC bracketing, reagent lots and lot-to-lot comparison (fabricated)</h2>
        <p className="mt-3 text-sm text-slate-600">
          Fabricated runs, lots and limits are evaluated by the real rule modules at a fixed demo timestamp; a rejected or held result still needs human technical review.
        </p>
        <p className="mt-2 text-xs text-slate-500">Fixed synthetic timestamp: {bracketLot.useAt}. All windows, thresholds and periods are fabricated examples, not regulatory guidance.</p>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <p className="rounded-xl bg-teal-50 p-4">Synthetic results not releasable: <strong>{bracketLot.counts.resultsNotReleasable}</strong></p>
          <p className="rounded-xl bg-teal-50 p-4">Synthetic lots not usable without flags (includes flagged, expired and unresolved): <strong>{bracketLot.counts.lotsNotUsable}</strong></p>
          <p className="rounded-xl bg-teal-50 p-4">Synthetic comparisons rejected: <strong>{bracketLot.counts.comparisonsRejected}</strong></p>
        </div>
        <div className="mt-6">
          <h3 className="font-semibold text-teal-800">QC bracketing (fabricated)</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <caption className="pb-3 text-left text-xs text-slate-500">Fabricated result times and bracket decisions; releasable is a rule outcome, not permission to release.</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Synthetic run / state</th>
                  <th scope="col" className="px-4 py-3">Synthetic result</th>
                  <th scope="col" className="px-4 py-3">Fabricated time (UTC)</th>
                  <th scope="col" className="px-4 py-3">Synthetic disposition</th>
                  <th scope="col" className="px-4 py-3">Rule explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bracketLot.bracketRows.map((row) => (
                  <tr key={row.resultId}>
                    <th scope="row" className="px-4 py-4 font-mono text-xs">{row.runId}<br />{row.runStatus}</th>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.resultId}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.timestamp}</td>
                    <td className="px-4 py-4 text-xs text-slate-600"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.disposition === 'releasable' ? statusStyles.accepted : row.disposition === 'held_for_repeat_qc' ? statusStyles.warning : statusStyles.rejected}`}>{row.disposition}</span></td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.rule}: {row.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-6">
          <h3 className="font-semibold text-teal-800">Reagent lots (fabricated)</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <caption className="pb-3 text-left text-xs text-slate-500">Fabricated governing limits and whole hours; recall takes effect at the synthetic use timestamp.</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Synthetic lot</th>
                  <th scope="col" className="px-4 py-3">Synthetic status</th>
                  <th scope="col" className="px-4 py-3">Fabricated governing limit (UTC)</th>
                  <th scope="col" className="px-4 py-3">Synthetic whole hours</th>
                  <th scope="col" className="px-4 py-3">Rule explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bracketLot.lotRows.map((row) => (
                  <tr key={row.lotId}>
                    <th scope="row" className="px-4 py-4 font-mono text-xs">{row.lotId}</th>
                    <td className="px-4 py-4 text-xs text-slate-600"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === 'usable' ? statusStyles.accepted : row.status === 'usable_with_flag' ? statusStyles.warning : statusStyles.rejected}`}>{row.status}</span></td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.governingLimitAt ?? 'Unresolved'}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.wholeHours ?? '—'} {row.timeLabel}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.ruleCode}: {row.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-6">
          <h3 className="font-semibold text-teal-800">Lot-to-lot comparison (fabricated)</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <caption className="pb-3 text-left text-xs text-slate-500">Fabricated paired values and limits; mean difference and percent bias rounded to two decimals.</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Fabricated comparison</th>
                  <th scope="col" className="px-4 py-3">Synthetic decision</th>
                  <th scope="col" className="px-4 py-3">Synthetic pairs</th>
                  <th scope="col" className="px-4 py-3">Synthetic mean difference</th>
                  <th scope="col" className="px-4 py-3">Synthetic percent bias</th>
                  <th scope="col" className="px-4 py-3">Synthetic outliers</th>
                  <th scope="col" className="px-4 py-3">Criterion explanation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bracketLot.comparisonRows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="px-4 py-4 font-mono text-xs">{row.label}</th>
                    <td className="px-4 py-4 text-xs text-slate-600"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.decision === 'accept' ? statusStyles.accepted : statusStyles.rejected}`}>{row.decision}</span></td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.pairCount}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.meanDifference} {row.unit}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.percentBias}%</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.outlierCount}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.governingCriterion}: {row.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <MethodPerformancePanel />
    </div>
  );
}
