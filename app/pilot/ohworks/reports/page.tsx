import { buildPilotReportDeliveryView } from '@/lib/ohworks-demo-report-delivery-view';
import { resolveRoleView } from '@/lib/ohworks-pilot';
import { SendoutCancellationCommentsPanel } from '@/app/pilot/ohworks/_components/sendout-cancellation-comments-panel';

interface PageProps {
  searchParams?: Promise<{ role?: string }>;
}

export default async function OHWorksReportDelivery({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const role = resolveRoleView(params?.role);
  const view = buildPilotReportDeliveryView();

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Synthetic demonstration data only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Report delivery — format, route, amend</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          Every value is fabricated. NOTHING is sent — no email, fax, portal message or API call is made.
          The routing rule only computes who would be permitted to receive which test class.
          This read-only demonstration runs local rules without a SENAITE server or customer data.
          All limits, thresholds and role assignments are fabricated examples, not regulatory guidance.
        </p>
        <p className="mt-3 text-xs text-slate-500">Current role view: {role.label}. Every role sees the same synthetic report delivery.</p>
      </div>
      <section aria-label="Synthetic report counts" className="grid gap-4 sm:grid-cols-3">
        {([
          ['Censored results', view.counts.censoredResults],
          ['Blocked reports', view.counts.blockedReports],
          ['Invalid chains', view.counts.invalidChains],
        ] as const).map(([label, count]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Synthetic — {label}</p>
            <p className="mt-2 text-3xl font-semibold">{count}</p>
          </div>
        ))}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Formatting (fabricated)</h2>
        <p className="mt-2 text-sm text-slate-600">Declared fabricated formats: two decimals, detection limit 1 with &lt;, quantitation limit 100 with &gt;, in synthetic-units. Qualitative bands: [1, 10) low; [10, unbounded) high.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="pb-3 text-left text-xs text-slate-500">Every analyte, input and report string below is synthetic.</caption>
            <thead className="bg-slate-50"><tr><th scope="col" className="p-3">Fabricated analyte / value</th><th scope="col" className="p-3">Report string</th><th scope="col" className="p-3">Censoring / qualitative label / unresolved reason</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{view.formatting.map((row) => (
              <tr key={row.analyteCode}><th scope="row" className="p-3 font-medium">{row.analyteCode}: {row.value}</th><td className="p-3">{row.outcome?.reportString ?? 'Unresolved'}</td><td className="p-3">{row.outcome ? `${row.outcome.censoring ?? 'Uncensored'}; ${row.outcome.qualitativeLabel ?? 'No qualitative label'}` : `${row.errorCode}: ${row.explanation}`}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Distribution permissions (fabricated; sends nothing)</h2>
        <p className="mt-2 text-sm text-slate-600">DISTRIBUTED is the calculator status only, never evidence of delivery. Unrouted classes remain unresolved even when other classes have permitted routes. The synthetic employer role is limited to fitness outcomes.</p>
        <div className="mt-4 space-y-5">{view.distribution.map((row) => (
          <article key={row.report.reportReferenceToken} className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-teal-800">{row.report.reportReferenceToken} — {row.report.kind} — {row.outcome.status}</h3>
            <p className="mt-2 text-sm">Synthetic classes: {row.report.testClasses.join(', ')}</p>
            <ul className="mt-2 space-y-1 text-sm">{row.outcome.routedEntries.map((entry, index) => <li key={index}>{entry.testClass} → {entry.recipientRole} → {entry.channelType}</li>)}</ul>
            {row.outcome.routedEntries.length === 0 && <p className="mt-2 text-sm">No permitted routes computed.</p>}
            <p className="mt-2 text-sm">Unrouted classes: {row.outcome.unroutedTestClasses.join(', ') || 'None returned'}</p>
            {row.outcome.block && <p className="mt-2 text-sm text-amber-800">{row.outcome.block.code}: {row.explanation} Next action: {row.nextAction}</p>}
          </article>
        ))}</div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Amendment chains (fabricated)</h2>
        <p className="mt-2 text-sm text-slate-600">Synthetic version checks only; no report is changed. VALID is a rule outcome, not authorization to amend a real report.</p>
        <div className="mt-4 space-y-5">{view.amendments.map((row) => (
          <article key={row.reportReferenceToken} className="rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold text-teal-800">{row.reportReferenceToken} — {row.outcome.status}</h3>
            <p className="mt-2 text-sm">Synthetic current effective version: {row.outcome.currentEffectiveVersion}</p>
            <p className="mt-2 text-sm">Accepted supersede chain: baseline 1{row.outcome.supersedeChain.map((link) => ` → ${link.versionNumber} (supersedes ${link.supersedesVersion})`).join('')}</p>
            <ul className="mt-2 text-sm">{row.amendments.map((entry) => <li key={entry.versionNumber}>Fabricated amendment {entry.versionNumber}, supersedes {entry.supersedesVersion}: {entry.authorRole}, {entry.reasonCode}, {entry.timestamp}</li>)}</ul>
            {row.outcome.failure && <p className="mt-2 text-sm text-amber-800">{row.outcome.failure.code}: {row.explanation} Next action: {row.nextAction}</p>}
          </article>
        ))}</div>
      </section>
      <SendoutCancellationCommentsPanel />
    </div>
  );
}
