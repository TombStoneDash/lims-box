import { Fragment } from 'react';
import { Fingerprint } from 'lucide-react';
import { buildPilotAccessionIdentityView } from '@/lib/ohworks-demo-accession-identity-view';

const outcomeStyles = {
  ok: 'bg-teal-50 text-teal-800',
  refused: 'bg-rose-50 text-rose-800',
};

const matchStyles = {
  exact: 'bg-teal-50 text-teal-800',
  probable: 'bg-amber-50 text-amber-800',
  none: 'bg-rose-50 text-rose-800',
};

export function AccessionIdentityPanel() {
  const view = buildPilotAccessionIdentityView();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Label check characters, identifier reconciliation and aliquot splits (fabricated)</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Fabricated specimen labels, identifiers and aliquot volumes are evaluated by the real rule modules;
        a refused label or split would stop at accessioning for a person to resolve. Every identifier, volume
        and threshold below is a fabricated example, not regulatory guidance, and nothing here reads or writes
        a real specimen, patient or customer record.
      </p>
      <p className="mt-4 font-semibold text-teal-800">
        Fabricated labels refused: {view.counts.labelsRefused} · Fabricated identifiers unresolved: {view.counts.identifiersUnresolved} ·
        {' '}Fabricated splits refused: {view.counts.splitsRefused}
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-xs">
          <caption className="pb-2 text-left text-sm font-semibold text-teal-700">Fabricated specimen labels — every label is generated or mutated for this demo</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Label', 'Outcome', 'Site prefix', 'Sequence', 'Year'].map((label) => (
                <th key={label} scope="col" className="px-3 py-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.labelRows.map((row) => (
              <Fragment key={row.raw}>
                <tr>
                  <th scope="row" className="px-3 py-3 font-mono font-normal">{row.raw}</th>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 font-semibold ${row.outcome === 'ok' ? outcomeStyles.ok : outcomeStyles.refused}`}>
                      {row.outcome === 'ok' ? 'Decoded' : row.outcome}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono">{row.sitePrefix ?? '—'}</td>
                  <td className="px-3 py-3 tabular-nums">{row.sequence ?? '—'}</td>
                  <td className="px-3 py-3 tabular-nums">{row.year ?? '—'}</td>
                </tr>
                {row.outcome !== 'ok' ? (
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
        <table className="w-full min-w-[700px] text-left text-xs">
          <caption className="pb-2 text-left text-sm font-semibold text-teal-700">Fabricated identifier normalization — identifiers only, never names or dates of birth</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Raw identifier', 'Outcome', 'Canonical form'].map((label) => (
                <th key={label} scope="col" className="px-3 py-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.identifierRows.map((row) => (
              <Fragment key={row.raw}>
                <tr>
                  <th scope="row" className="px-3 py-3 font-mono font-normal">{row.raw}</th>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 font-semibold ${row.outcome === 'ok' ? outcomeStyles.ok : outcomeStyles.refused}`}>
                      {row.outcome === 'ok' ? 'Resolved' : row.outcome}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono">{row.canonical ?? '—'}</td>
                </tr>
                {row.outcome !== 'ok' ? (
                  <tr>
                    <td colSpan={3} className="px-3 pb-3 text-slate-500">{row.explanation}</td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-xs">
          <caption className="pb-2 text-left text-sm font-semibold text-teal-700">Fabricated identifier match scoring — deterministic comparison, not a real record merge</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Identifier A', 'Identifier B', 'Score', 'Result'].map((label) => (
                <th key={label} scope="col" className="px-3 py-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.matchRows.map((row) => {
              const style = row.exact ? matchStyles.exact : row.isProbableMatch ? matchStyles.probable : matchStyles.none;
              const resultLabel = row.exact ? 'Exact match' : row.isProbableMatch ? 'Probable match' : 'No match';
              return (
                <Fragment key={`${row.rawA}-${row.rawB}`}>
                  <tr>
                    <th scope="row" className="px-3 py-3 font-mono font-normal">{row.canonicalA}</th>
                    <td className="px-3 py-3 font-mono">{row.canonicalB}</td>
                    <td className="px-3 py-3 tabular-nums">{row.score}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 font-semibold ${style}`}>{resultLabel}</span></td>
                  </tr>
                  {!row.exact ? (
                    <tr>
                      <td colSpan={4} className="px-3 pb-3 text-slate-500">{row.explanation}</td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-xs">
          <caption className="pb-2 text-left text-sm font-semibold text-teal-700">Fabricated aliquot splits — synthetic parent accessions and volumes only</caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Scenario', 'Parent', 'Status', 'Children derived'].map((label) => (
                <th key={label} scope="col" className="px-3 py-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.aliquotRows.map((row) => (
              <Fragment key={row.parentAccessionId}>
                <tr>
                  <th scope="row" className="px-3 py-3 font-normal">{row.scenario}</th>
                  <td className="px-3 py-3 font-mono">{row.parentAccessionId}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 font-semibold ${row.status === 'VALID' ? outcomeStyles.ok : outcomeStyles.refused}`}>
                      {row.status === 'VALID' ? 'Split accepted' : `Refused: ${row.failureCode}`}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {row.children ? row.children.map((child) => `${child.childId} (${child.purpose}, ${child.volume})`).join(' · ') : '—'}
                  </td>
                </tr>
                {row.status !== 'VALID' ? (
                  <tr>
                    <td colSpan={4} className="px-3 pb-3 text-slate-500">{row.explanation}</td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
        <Fingerprint aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
        Labels, identifiers and volumes are fabricated and evaluated by the real rule modules; a refused label
        or split would stop at accessioning for a person to resolve.
      </p>
    </section>
  );
}
