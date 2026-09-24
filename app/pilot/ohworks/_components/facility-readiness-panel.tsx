import { Building2 } from 'lucide-react';
import { buildPilotFacilityReadinessView } from '@/lib/ohworks-demo-facility-readiness-view';

const decisionStyles = {
  qualified: 'bg-teal-50 text-teal-800',
  not_qualified: 'bg-rose-50 text-rose-800',
};

const consumableStatusStyles = {
  ok: 'bg-teal-50 text-teal-800',
  'reorder-needed': 'bg-rose-50 text-rose-800',
  unresolved: 'bg-amber-50 text-amber-800',
};

export function FacilityReadinessPanel() {
  const view = buildPilotFacilityReadinessView();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Building2 aria-hidden="true" className="h-5 w-5 text-teal-700" />
        <h2 className="text-lg font-semibold">Facility readiness: room environment, equipment qualification and consumable stock (fabricated)</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{view.caption}</p>
      <p className="mt-2 text-xs text-slate-500">Fixed synthetic run timestamp: {view.runAt}.</p>

      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <p className="rounded-xl bg-teal-50 p-4">Synthetic rooms with a critical excursion: <strong>{view.headline.roomsWithCriticalExcursion}</strong></p>
        <p className="rounded-xl bg-teal-50 p-4">Synthetic instruments not qualified: <strong>{view.headline.instrumentsNotQualified}</strong></p>
        <p className="rounded-xl bg-teal-50 p-4">Synthetic consumables to reorder or unresolved: <strong>{view.headline.consumablesToReorderOrUnresolved}</strong></p>
      </div>

      <div className="mt-6">
        <h3 className="font-semibold text-teal-800">Room environment (fabricated)</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <caption className="pb-3 text-left text-xs text-slate-500">Fabricated one-day reading history per synthetic room; excursion minutes are whole minutes.</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Synthetic room</th>
                <th scope="col" className="px-4 py-3">Readings</th>
                <th scope="col" className="px-4 py-3">Minor / critical</th>
                <th scope="col" className="px-4 py-3">Excursion minutes</th>
                <th scope="col" className="px-4 py-3">Worst excursion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {view.rooms.map((row) => {
                const passing = row.resolved && (row.minorExcursionCount ?? 0) === 0 && (row.criticalExcursionCount ?? 0) === 0;
                return (
                  <tr key={row.roomId}>
                    <th scope="row" className="px-4 py-4 font-mono text-xs">{row.roomId}</th>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.readingCount ?? '—'}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${!row.resolved ? consumableStatusStyles.unresolved : passing ? decisionStyles.qualified : decisionStyles.not_qualified}`}>
                        {row.resolved ? `${row.minorExcursionCount} / ${row.criticalExcursionCount}` : 'unresolved'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.totalExcursionMinutes ?? '—'}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">
                      {row.worstExcursion === null ? '—' : `${row.worstExcursion.severity} ${row.worstExcursion.metric} at ${row.worstExcursion.worstValue} (${row.worstExcursion.minutes} min)`}
                      {!passing && <p className="mt-1 text-slate-500">{row.explanation}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="font-semibold text-teal-800">Equipment qualification (fabricated)</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <caption className="pb-3 text-left text-xs text-slate-500">Fabricated registry evaluated at the fixed synthetic run timestamp; unqualified is a rule outcome, not permission to use the instrument.</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Synthetic instrument</th>
                <th scope="col" className="px-4 py-3">Decision</th>
                <th scope="col" className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {view.instruments.map((row) => (
                <tr key={row.instrumentId}>
                  <th scope="row" className="px-4 py-4 font-mono text-xs">{row.instrumentId}</th>
                  <td className="px-4 py-4 text-xs text-slate-600">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${decisionStyles[row.decision]}`}>{row.decision}</span>
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-600">
                    {row.reasonCode}
                    {row.decision !== 'qualified' && <p className="mt-1 text-slate-500">{row.explanation}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="font-semibold text-teal-800">Consumable stock (fabricated)</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <caption className="pb-3 text-left text-xs text-slate-500">Fabricated lots consumed soonest-expiring first; days of cover rounded to one decimal.</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Synthetic consumable</th>
                <th scope="col" className="px-4 py-3">Stock on hand</th>
                <th scope="col" className="px-4 py-3">Days of cover</th>
                <th scope="col" className="px-4 py-3">Reorder point</th>
                <th scope="col" className="px-4 py-3">Reorder quantity</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Lots at expiry risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {view.consumables.map((row) => {
                const passing = row.status === 'ok' && (row.expiredQuantityTotal ?? 0) === 0;
                return (
                  <tr key={row.consumableId}>
                    <th scope="row" className="px-4 py-4 font-mono text-xs">{row.consumableId}</th>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.stockOnHand ?? '—'}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.daysOfCover ?? '—'}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.reorderPoint ?? '—'}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">{row.reorderQuantity ?? '—'}</td>
                    <td className="px-4 py-4 text-xs text-slate-600">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${consumableStatusStyles[row.status]}`}>{row.status}</span>
                      {!passing && <p className="mt-1 text-slate-500">{row.explanation}</p>}
                    </td>
                    <td className="px-4 py-4 text-xs text-slate-600">
                      {row.lotsAtRisk.length === 0
                        ? '—'
                        : row.lotsAtRisk.map((lot) => (
                          <p key={lot.lotId}>{lot.lotId}: {lot.expiredQuantity} of {lot.quantityOnHand} will expire unused in {lot.daysUntilExpiry} days</p>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
