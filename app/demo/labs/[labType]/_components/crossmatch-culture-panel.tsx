import { buildPilotCrossmatchCultureView } from '@/lib/ohworks-demo-crossmatch-culture-view';

const statusStyles: Record<string, string> = {
  clear_to_crossmatch: 'bg-emerald-50 text-emerald-800',
  hold_antibody_workup: 'bg-rose-50 text-rose-800',
  hold_sample_expired: 'bg-rose-50 text-rose-800',
  hold_pending_screen: 'bg-amber-50 text-amber-800',
};

const cell = 'px-4 py-4';
const table = 'w-full min-w-[900px] text-left text-sm';
const heading = 'bg-slate-50 text-xs uppercase tracking-wide text-slate-500';

function Pill({ label, tone }: { label: string; tone: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

/** Read-only synthetic panel; no blood product is issued and no culture is reported. */
export function CrossmatchCulturePanel() {
  const view = buildPilotCrossmatchCultureView();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Blood bank crossmatch holds and microbiology culture read schedule (fabricated)</h2>
      <p className="mt-3 text-sm text-slate-600">
        Fabricated crossmatch requests and cultures are evaluated by the real rule modules at a fixed demo timestamp.
        This panel issues no blood product, reports no culture and describes no real person; requests, cultures, policy
        limits and the grace period shown here are fabricated examples, not regulatory guidance.
      </p>
      <p className="mt-2 text-xs text-slate-500">Fixed synthetic timestamp: {view.now}. Fabricated grace period: {view.gracePeriodHours}h.</p>

      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <p className="rounded-xl bg-teal-50 p-4">Synthetic crossmatch requests on hold: <strong>{view.counts.crossmatchOnHold}</strong></p>
        <p className="rounded-xl bg-teal-50 p-4">Synthetic culture reads overdue: <strong>{view.counts.cultureReadsOverdue}</strong></p>
      </div>

      <div className="mt-6">
        <h3 className="font-semibold text-teal-800">Crossmatch holds (fabricated)</h3>
        <div className="mt-3 overflow-x-auto">
          <table className={table}>
            <caption className="pb-3 text-left text-xs text-slate-500">
              Fabricated type-and-screen snapshots; clear_to_crossmatch is a rule outcome, not authorization to issue a unit.
            </caption>
            <thead className={heading}>
              <tr>
                {['Fabricated request', 'Synthetic ABO/RhD', 'Synthetic screen', 'Fabricated prior antibodies',
                  'Fabricated sample age / limit (h)', 'Synthetic units requested', 'Synthetic status', 'Extended crossmatch'].map((label) => (
                  <th scope="col" className={cell} key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {view.crossmatchRows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className={`${cell} font-mono text-xs`}>{row.id}</th>
                  <td className={cell}>{row.abo} {row.rhD}</td>
                  <td className={cell}>{row.antibodyScreenResult}</td>
                  <td className={cell}>{row.priorAntibodyIdentified.join(', ') || 'None'}</td>
                  <td className={cell}>{row.sampleAgeHours} / {row.maxSampleAgeHoursForType}</td>
                  <td className={cell}>{row.requestedUnitCount}</td>
                  <td className={cell}>
                    <Pill label={row.status} tone={statusStyles[row.status]} />
                    {row.status !== 'clear_to_crossmatch' && <p className="mt-2 text-xs text-slate-500">{row.reason}</p>}
                  </td>
                  <td className={cell}>{row.requiresExtendedCrossmatch ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="font-semibold text-teal-800">Culture read schedule (fabricated)</h3>
        <div className="mt-3 overflow-x-auto">
          <table className={table}>
            <caption className="pb-3 text-left text-xs text-slate-500">
              Fabricated plating timestamps; overdue is computed against the fixed synthetic timestamp above with the fabricated grace period.
            </caption>
            <thead className={heading}>
              <tr>
                {['Fabricated culture', 'Synthetic specimen type', 'Fabricated plated at (UTC)', 'Extended incubation',
                  'Synthetic reads', 'Fabricated final negative (UTC)'].map((label) => (
                  <th scope="col" className={cell} key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {view.cultureRows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className={`${cell} font-mono text-xs`}>{row.id}</th>
                  <td className={cell}>{row.specimenType}</td>
                  <td className={cell}>{row.platedAt}</td>
                  <td className={cell}>{row.requiresExtendedIncubation ? 'Yes' : 'No'}</td>
                  <td className={cell}>
                    <ul className="space-y-1">
                      {row.reads.map((read) => (
                        <li key={read.label}>
                          <Pill label={read.overdue ? 'overdue' : 'on schedule'} tone={read.overdue ? statusStyles.hold_antibody_workup : statusStyles.clear_to_crossmatch} />
                          {' '}{read.label}: {read.dueAt}
                        </li>
                      ))}
                    </ul>
                    {row.reads.some((read) => read.overdue) && (
                      <p className="mt-2 text-xs text-slate-500">One or more fabricated reads are past due beyond the {view.gracePeriodHours}h grace period and need a manual read.</p>
                    )}
                  </td>
                  <td className={cell}>{row.finalNegativeAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
