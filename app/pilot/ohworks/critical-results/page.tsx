import { buildPilotCriticalResultsView } from '@/lib/ohworks-demo-critical-results-view';
import { resolveRoleView } from '@/lib/ohworks-pilot';

interface PageProps {
  searchParams?: Promise<{ role?: string }>;
}

const styles = {
  confirmed: 'bg-emerald-50 text-emerald-800',
  CONFIRMED: 'bg-emerald-50 text-emerald-800',
  contact_now: 'bg-emerald-50 text-emerald-800',
  pending: 'bg-amber-50 text-amber-800',
  wait: 'bg-amber-50 text-amber-800',
  UNCONFIRMED: 'bg-amber-50 text-amber-800',
  discordant: 'bg-rose-50 text-rose-800',
  CHAIN_GAP: 'bg-rose-50 text-rose-800',
  escalation_chain_exhausted: 'bg-rose-50 text-rose-800',
};
function Pill({ status }: { status: keyof typeof styles }) {
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>{status}</span>;
}
const cell = 'px-4 py-4';
const section = 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm';
const table = 'w-full min-w-[900px] text-left text-sm';
const heading = 'bg-slate-50 text-xs uppercase tracking-wide text-slate-500';

export default async function OHWorksCriticalResults({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const role = resolveRoleView(params?.role);
  const view = buildPilotCriticalResultsView();
  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Synthetic demonstration data only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Critical results — repeat, notify, escalate</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          Every value is fabricated. NO notification is sent from this page — nothing here pages, calls, emails or texts anyone.
          The rules only decide what a human would be allowed or required to do next. This read-only demonstration
          has no SENAITE server connection and uses no real customer data. All limits, windows, thresholds and periods
          are fabricated examples, not regulatory guidance.
        </p>
        <p className="mt-3 text-xs text-slate-500">Current role view: {role.label}. Every role sees the same synthetic results.</p>
      </div>
      <section aria-label="Synthetic headline counts" className="grid gap-4 sm:grid-cols-3">
        {[
          ['Synthetic notify-blocked results', view.counts.notifyBlocked],
          ['Synthetic logs outside window or unconfirmed (including chain gaps)', view.counts.outsideWindowOrUnconfirmed],
          ['Synthetic exhausted chains', view.counts.exhaustedChains],
        ].map(([label, count]) => <div key={label} className={section}><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{label}</p><p className="mt-2 text-3xl font-semibold">{count}</p></div>)}
      </section>
      <section className={section}>
        <h2 className="text-lg font-semibold text-teal-800">Repeat policy — fabricated critical results</h2>
        <div className="mt-4 overflow-x-auto"><table className={table}>
          <caption className="pb-3 text-left text-xs text-slate-500">Fabricated values; current role: {role.label}. Notification allowed is a rule decision only; discordance requires human escalation.</caption>
          <thead className={heading}><tr>{['Synthetic subject / analyte', 'Fabricated first / repeats', 'Synthetic status / explanation', 'Synthetic report value', 'Notify allowed by rule'].map((label) => <th scope="col" className={cell} key={label}>{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{view.repeatRows.map((row) => <tr key={row.subject}>
            <th scope="row" className={`${cell} font-mono text-xs`}>{row.subject}<br />{row.analyte}</th>
            <td className={cell}>{row.firstValue} {row.unit}<br />Repeats: {row.repeatValues.join(', ') || 'None'} {row.repeatValues.length > 0 ? row.unit : ''}</td>
            <td className={cell}><Pill status={row.status} /><p className="mt-2 text-xs text-slate-500">{row.explanation}</p></td>
            <td className={cell}>{row.reportValue === null ? 'Not set' : `${row.reportValue} ${row.unit}`}</td>
            <td className={cell}>{row.notifyAllowed ? 'Yes' : 'No'}</td>
          </tr>)}</tbody>
        </table></div>
      </section>
      <section className={section}>
        <h2 className="text-lg font-semibold text-teal-800">Notification log — fabricated attempts</h2>
        <div className="mt-4 overflow-x-auto"><table className={table}>
          <caption className="pb-3 text-left text-xs text-slate-500">Synthetic records, not actual contact attempts; current role: {role.label}. Hash display uses up to the first 12 available characters.</caption>
          <thead className={heading}><tr>{['Synthetic subject / analyte', 'Fabricated value / range', 'Synthetic attempts / final role', 'Synthetic status / explanation', 'Fabricated minutes / window', 'Synthetic hash'].map((label) => <th scope="col" className={cell} key={label}>{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{view.logRows.map((row) => <tr key={row.subjectId}>
            <th scope="row" className={`${cell} font-mono text-xs`}>{row.subjectId}<br />{row.analyteCode}</th>
            <td className={cell}>{row.value} {row.unit}<br />Range: {row.rangeLow}–{row.rangeHigh} {row.unit}</td>
            <td className={cell}>{row.attemptCount}<br />{row.finalContactRole}</td>
            <td className={cell}><Pill status={row.status} /><p className="mt-2 text-xs text-slate-500">{row.explanation}</p></td>
            <td className={cell}>{row.minutesToConfirmation ?? 'Not confirmed'}<br />Window satisfied: <span className={row.windowSatisfied ? 'text-emerald-800' : 'text-rose-800'}>{row.windowSatisfied ? 'Yes' : 'No'}</span></td>
            <td className={`${cell} font-mono text-xs`}>{row.entryHash}</td>
          </tr>)}</tbody>
        </table></div>
      </section>
      <section className={section}>
        <h2 className="text-lg font-semibold text-teal-800">Escalation planner — fabricated situations</h2>
        <div className="mt-4 overflow-x-auto"><table className={table}>
          <caption className="pb-3 text-left text-xs text-slate-500">Fixed synthetic time: {view.now}; current role: {role.label}. Fabricated wait minutes rounded to one decimal. Plans send nothing.</caption>
          <thead className={heading}><tr>{['Fabricated situation', 'Synthetic action / reason', 'Synthetic target role', 'Fabricated wait minutes'].map((label) => <th scope="col" className={cell} key={label}>{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{view.escalationRows.map((row) => <tr key={row.situation}>
            <th scope="row" className={cell}>{row.situation}</th>
            <td className={cell}><Pill status={row.action} /><p className="mt-2 text-xs text-slate-500">{row.reason}</p></td>
            <td className={cell}>{row.targetRole ?? 'None — chain exhausted'}</td>
            <td className={cell}>{row.waitMinutes.toFixed(1)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}
