import { buildPilotResultReviewView } from '@/lib/ohworks-demo-result-review-view';
import { resolveRoleView } from '@/lib/ohworks-pilot';
import { UnitsInterferencePanel } from '@/app/pilot/ohworks/_components/units-interference-panel';
import { ShiftHandoffPanel } from '@/app/pilot/ohworks/_components/shift-handoff-panel';

interface PageProps {
  searchParams?: Promise<{ role?: string }>;
}

const outcomeStyles = {
  AUTO_RELEASE: 'bg-emerald-50 text-emerald-800',
  HOLD_FOR_REVIEW: 'bg-amber-50 text-amber-800',
  HOLD: 'bg-rose-50 text-rose-800',
};

export default async function OHWorksResultReview({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const role = resolveRoleView(params?.role);
  const view = buildPilotResultReviewView();

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Synthetic demonstration data only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Result review queue — autoverification trace</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          Eight real rule modules run in-process on fabricated results. An AUTO_RELEASE here is a rule decision
          only; release still requires a distinct authorized technical-review event. Nothing is read from or
          written to a SENAITE server. Every value, identifier and outcome shown is synthetic. All limits,
          windows, thresholds and periods are fabricated examples, not regulatory guidance. This read-only
          page cannot release results and uses no customer data.
        </p>
        <p className="mt-3 text-xs text-slate-500">Current role view: {role.label}. Every role sees the same synthetic result review.</p>
      </div>

      <section aria-label="Synthetic result counts" className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Rule-released', count: view.totals.released },
          { label: 'Held', count: view.totals.held },
          { label: 'Turnaround breaches', count: view.totals.tatBreaches },
        ].map(({ label, count }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Synthetic — {label}</p>
            <p className="mt-2 text-3xl font-semibold">{count}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Held by reason</h2>
        <p className="mt-2 text-xs text-slate-500">Counts of fabricated results for each rule reason.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {view.heldByReason.map(({ code, count }) => (
            <li key={code}><span className="font-mono">{code}</span>: {count}</li>
          ))}
        </ul>
      </section>

      {view.rows.map((row) => (
        <section key={row.resultId} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-mono text-lg font-semibold">{row.resultId}</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${outcomeStyles[row.outcome]}`}>
              Synthetic decision: {row.outcome}
            </span>
          </div>
          <p className="mt-3 break-words text-xs text-slate-500">
            Fabricated subject: {row.subjectId} · Specimen: {row.specimenId} · Run: {row.runId} · Test: {row.testCode}
          </p>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold">Fabricated reported value</dt><dd>{row.reported ? `${row.reported.value.toFixed(2)} ${row.reported.unit}` : 'Unavailable — pipeline stopped before conversion'}</dd></div>
            <div><dt className="font-semibold">Synthetic reference flag</dt><dd>{row.reference ? `${row.reference.classification} — ${row.reference.flag}` : 'Not evaluated'}</dd></div>
            <div><dt className="font-semibold">Synthetic catalogue version</dt><dd>{row.catalogueVersionId ?? 'Unavailable'}</dd>
              {row.referenceInterval && <dd>Fabricated interval: {row.referenceInterval.lowerBound}–{row.referenceInterval.upperBound} {row.reported?.unit}</dd>}
            </div>
            <div><dt className="font-semibold">Synthetic turnaround</dt><dd>{row.turnaround ? `${row.turnaround.status} — ${row.turnaround.totalMinutes ?? 'Unavailable'} minutes` : 'Not evaluated'}</dd></div>
          </dl>
          <p className="mt-4 text-sm text-slate-600">Synthetic hold reasons: {row.holdReasonCodes.join(', ') || 'None'}</p>
          <details className="mt-5 rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer font-semibold text-teal-800">Rule trace</summary>
            <ol className="mt-4 list-decimal space-y-4 pl-5 text-sm">
              {row.trace.map((entry) => (
                <li key={entry.step}>
                  <p className="font-semibold">{entry.step} — {entry.decision}</p>
                  <p className="mt-1 text-slate-600">{entry.explanation}</p>
                  {entry.reasonCodes.length > 0 && <p className="mt-1 font-mono text-xs text-slate-500">{entry.reasonCodes.join(', ')}</p>}
                </li>
              ))}
            </ol>
          </details>
        </section>
      ))}

      <UnitsInterferencePanel />
      <ShiftHandoffPanel />
    </div>
  );
}
