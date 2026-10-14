import { Fragment } from 'react';
import { Truck } from 'lucide-react';
import { buildPilotSendoutCancellationCommentsView } from '@/lib/ohworks-demo-sendout-cancellation-comments-view';

const sendoutStatusStyles = {
  ok: 'bg-teal-50 text-teal-800',
  warning: 'bg-amber-50 text-amber-800',
  rejected: 'bg-rose-50 text-rose-800',
};

const cancellationOutcomeStyles = {
  allowed: 'bg-teal-50 text-teal-800',
  refused: 'bg-rose-50 text-rose-800',
  unresolved: 'bg-amber-50 text-amber-800',
};

export function SendoutCancellationCommentsPanel() {
  const view = buildPilotSendoutCancellationCommentsView();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Reference-lab send-outs, test cancellations and coded result comments (fabricated; sends nothing)</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Fabricated reference labs, orders and comment codes are evaluated by the real rule modules at a fixed
        synthetic timestamp; nothing on this page ships, cancels, bills or sends anything.
      </p>
      <p className="mt-2 text-xs text-slate-500">Fixed synthetic &quot;as of&quot; timestamp: {view.asOf}.</p>
      <p className="mt-4 font-semibold text-teal-800">
        Fabricated send-outs overdue or invalid: {view.counts.sendoutsOverdueOrInvalid} · Fabricated cancellations refused or unresolved: {view.counts.cancellationsRefusedOrUnresolved} · Fabricated comments refused: {view.counts.commentsRefused}
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-xs">
          <caption className="pb-2 text-left text-sm font-semibold text-teal-700">Fabricated reference-lab send-outs — all lab ids, tokens and timestamps are synthetic</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Send-out', 'Reference lab', 'Status', 'Current state', 'Expected result date', 'Overdue'].map((label) => (
                <th key={label} scope="col" className="px-3 py-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.sendoutRows.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <th scope="row" className="px-3 py-3 font-mono font-normal">{row.id}</th>
                  <td className="px-3 py-3">{row.referenceLabId}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 font-semibold ${row.status === 'VALID' ? sendoutStatusStyles.ok : sendoutStatusStyles.rejected}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">{row.currentState ?? '—'}</td>
                  <td className="px-3 py-3">{row.expectedResultDate ?? '—'}</td>
                  <td className="px-3 py-3">
                    {row.overdue ? (
                      <span className={`rounded-full px-2 py-1 font-semibold ${sendoutStatusStyles.warning}`}>Overdue by {row.daysOverdue} day(s)</span>
                    ) : row.resultedLate ? (
                      <span className={`rounded-full px-2 py-1 font-semibold ${sendoutStatusStyles.warning}`}>Resulted late</span>
                    ) : (
                      'No'
                    )}
                  </td>
                </tr>
                {row.failureCode ? (
                  <tr>
                    <td colSpan={6} className="px-3 pb-3 text-slate-500">{row.failureCode}: {row.explanation} Next action: {row.nextAction}</td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-xs">
          <caption className="pb-2 text-left text-sm font-semibold text-teal-700">Fabricated test-cancellation requests — all tokens and roles are synthetic</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Order', 'Stage', 'Reason', 'Requester role', 'Outcome', 'Credit note due', 'Amended report required'].map((label) => (
                <th key={label} scope="col" className="px-3 py-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.cancellationRows.map((row) => (
              <Fragment key={row.token}>
                <tr>
                  <th scope="row" className="px-3 py-3 font-mono font-normal">{row.token}</th>
                  <td className="px-3 py-3">{row.stage}</td>
                  <td className="px-3 py-3">{row.reason}</td>
                  <td className="px-3 py-3">{row.role}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 font-semibold ${cancellationOutcomeStyles[row.outcome]}`}>
                      {row.outcome}
                    </span>
                  </td>
                  <td className="px-3 py-3">{row.creditNoteDue === null ? '—' : row.creditNoteDue ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-3">{row.amendedReportRequired === null ? '—' : row.amendedReportRequired ? 'Yes' : 'No'}</td>
                </tr>
                {row.outcome !== 'allowed' ? (
                  <tr>
                    <td colSpan={7} className="px-3 pb-3 text-slate-500">
                      {row.errorCode ? `${row.errorCode}: ` : ''}{row.explanation}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <caption className="pb-2 text-left text-sm font-semibold text-teal-700">Fabricated coded result comments, in declared priority order — no free text is ever accepted</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Code', 'Priority', 'Rendered text'].map((label) => (
                <th key={label} scope="col" className="px-3 py-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.commentRows.map((row) => (
              <tr key={row.code}>
                <th scope="row" className="px-3 py-3 font-mono font-normal">{row.code}</th>
                <td className="px-3 py-3">{row.priority}</td>
                <td className="px-3 py-3">{row.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <caption className="pb-2 text-left text-sm font-semibold text-teal-700">Fabricated refused comment requests — each is caught and shown, never rendered as partial text</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Requested code', 'Refusal', 'Explanation'].map((label) => (
                <th key={label} scope="col" className="px-3 py-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.refusedCommentRows.map((row, index) => (
              <tr key={`${row.code}-${index}`}>
                <th scope="row" className="px-3 py-3 font-mono font-normal">{row.code}</th>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-1 font-semibold ${sendoutStatusStyles.rejected}`}>{row.errorCode}</span>
                </td>
                <td className="px-3 py-3 text-slate-500">{row.explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
        <Truck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
        Reference labs, orders and comment codes are fabricated and evaluated by the real rule modules; nothing on
        this page ships, cancels, bills or sends anything.
      </p>
    </section>
  );
}
