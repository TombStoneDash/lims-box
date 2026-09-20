import { Activity } from 'lucide-react';
import { buildPilotQcView } from '@/lib/ohworks-demo-qc-view';
import { resolveRoleView } from '@/lib/ohworks-pilot';

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
    </div>
  );
}
