import { Fragment } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { buildPilotCapaWorksheetView } from '@/lib/ohworks-demo-capa-worksheet-view';

const stateStyles = {
  ok: 'bg-teal-50 text-teal-800',
  blocked: 'bg-rose-50 text-rose-800',
};

export function CapaWorksheetPanel() {
  const view = buildPilotCapaWorksheetView();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Corrective actions and worksheet second-person verification (fabricated)</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Fabricated corrective-action records and worksheets are evaluated by the real workflow modules; a blocked
        step is what the system would refuse and route to a person, and nothing here describes a real employee.
      </p>
      <p className="mt-4 font-semibold text-teal-800">
        Fabricated corrective actions blocked: {view.counts.correctiveActionsBlocked} · Fabricated worksheets blocked: {view.counts.worksheetsBlocked}
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-xs">
          <caption className="pb-2 text-left text-sm font-semibold text-teal-700">Fabricated corrective-action (CAPA) records — all identifiers and events are synthetic</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Record', 'Steps applied', 'Root cause', 'Final state', 'Outcome'].map((label) => (
                <th key={label} scope="col" className="px-3 py-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.correctiveActionRows.map((row) => (
              <Fragment key={row.recordId}>
                <tr>
                  <th scope="row" className="px-3 py-3 font-mono font-normal">{row.recordId}</th>
                  <td className="px-3 py-3 tabular-nums">{row.stepsApplied}</td>
                  <td className="px-3 py-3">{row.rootCause ?? '—'}</td>
                  <td className="px-3 py-3">{row.finalState}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 font-semibold ${row.blocked ? stateStyles.blocked : stateStyles.ok}`}>
                      {row.blocked ? `Blocked: ${row.blockCode}` : 'Reached final state'}
                    </span>
                  </td>
                </tr>
                {row.blocked ? (
                  <tr>
                    <td colSpan={5} className="px-3 pb-3 text-slate-500">{row.explanation}</td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-xs">
          <caption className="pb-2 text-left text-sm font-semibold text-teal-700">Fabricated worksheets — all identifiers and events are synthetic</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Worksheet', 'Type', 'High-risk', 'Step trail', 'Final state', 'Outcome'].map((label) => (
                <th key={label} scope="col" className="px-3 py-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.worksheetRows.map((row) => (
              <Fragment key={row.worksheetId}>
                <tr>
                  <th scope="row" className="px-3 py-3 font-mono font-normal">{row.worksheetId}</th>
                  <td className="px-3 py-3">{row.worksheetType}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 font-semibold ${row.highRisk ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                      {row.highRisk ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{row.stepTrail.map((step) => `${step.kind} (${step.role})`).join(' → ')}</td>
                  <td className="px-3 py-3">{row.finalState}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 font-semibold ${row.blocked ? stateStyles.blocked : stateStyles.ok}`}>
                      {row.blocked ? `Blocked: ${row.blockCode}` : 'Reached final state'}
                    </span>
                  </td>
                </tr>
                {row.blocked ? (
                  <tr>
                    <td colSpan={6} className="px-3 pb-3 text-slate-500">{row.explanation}</td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
        <ClipboardCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
        Records, actors and worksheets are fabricated and evaluated by the real workflow modules; a blocked step is
        what the system would refuse and route to a person, and nothing here describes a real employee.
      </p>
    </section>
  );
}
