import { ClipboardCheck } from 'lucide-react';
import { buildPilotShiftHandoffView } from '@/lib/ohworks-demo-shift-handoff-view';

const severityStyles = {
  blocking: 'bg-rose-50 text-rose-800',
  attention: 'bg-amber-50 text-amber-800',
  info: 'bg-slate-100 text-slate-700',
};

export function ShiftHandoffPanel() {
  const view = buildPilotShiftHandoffView();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <ClipboardCheck aria-hidden="true" className="h-5 w-5 text-teal-700" />
        <h2 className="text-lg font-semibold">Shift handoff checklist (fabricated end-of-shift state)</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{view.caption}</p>
      <p className="mt-2 text-xs text-slate-500">Fixed synthetic handoff timestamp: {view.generatedAt}.</p>
      <p className="mt-2 text-sm font-semibold text-teal-800">
        Synthetic handoff readiness: {view.readyForHandoff ? 'no blocking items' : `${view.blockingIssueCount} blocking item(s)`}
      </p>

      <ul className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <li><span className={`rounded-full px-2.5 py-1 font-semibold ${severityStyles.blocking}`}>Blocking - must be resolved before handoff</span></li>
        <li><span className={`rounded-full px-2.5 py-1 font-semibold ${severityStyles.attention}`}>Attention - hand over with a note</span></li>
        <li><span className={`rounded-full px-2.5 py-1 font-semibold ${severityStyles.info}`}>Info - no action required</span></li>
      </ul>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="pb-3 text-left text-xs text-slate-500">
            Fabricated end-of-shift state evaluated by the real shift-handoff rule module; sorted blocking-first, then attention, then info.
          </caption>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3">Synthetic item</th>
              <th scope="col" className="px-4 py-3">Category</th>
              <th scope="col" className="px-4 py-3">Severity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.rows.map((row, index) => (
              <tr key={`${row.category}-${index}`}>
                <td className="px-4 py-4 text-xs text-slate-600">{row.description}</td>
                <td className="px-4 py-4 font-mono text-xs">{row.category}</td>
                <td className="px-4 py-4 text-xs text-slate-600">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${severityStyles[row.severity]}`}>
                    {row.severityLabel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
