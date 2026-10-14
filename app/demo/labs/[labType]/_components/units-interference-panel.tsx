import { Fragment } from 'react';
import { FlaskConical } from 'lucide-react';
import { buildPilotUnitsInterferenceView } from '@/lib/ohworks-demo-units-interference-view';

const conversionOutcomeStyles = {
  converted: 'bg-teal-50 text-teal-800',
  refused: 'bg-rose-50 text-rose-800',
};

const decisionStatusStyles = {
  report: 'bg-teal-50 text-teal-800',
  report_with_comment: 'bg-amber-50 text-amber-800',
  suppress: 'bg-rose-50 text-rose-800',
};

export function UnitsInterferencePanel() {
  const view = buildPilotUnitsInterferenceView();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <FlaskConical aria-hidden="true" className="h-5 w-5 text-teal-700" />
        <h2 className="text-lg font-semibold">Canonical unit conversion and hemolysis / icterus / lipemia interference checks (fabricated)</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Fabricated analytes, thresholds and index values are evaluated by the real rule modules; a suppressed result
        would be held for human review, nothing is released or withheld automatically here.
      </p>
      <p className="mt-4 font-semibold text-teal-800">
        Fabricated conversions refused: {view.counts.conversionsRefused} · Fabricated analytes suppressed: {view.counts.analytesSuppressed} · Fabricated analytes reported with a comment: {view.counts.analytesReportedWithComment}
      </p>

      <div className="mt-5 overflow-x-auto">
        <h3 className="font-semibold text-teal-800">Unit conversion (fabricated)</h3>
        <table className="mt-3 w-full min-w-[880px] text-left text-xs">
          <caption className="pb-2 text-left text-xs text-slate-500">
            Fabricated result values converted to each synthetic analyte&apos;s declared canonical reporting unit by the
            real conversion module; refused conversions are caught and shown, never guessed at.
          </caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Result', 'Analyte', 'Input', 'Canonical value', 'Significant figures', 'Outcome'].map((label) => (
                <th key={label} scope="col" className="px-3 py-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.conversionRows.map((row) => (
              <Fragment key={row.id}>
                <tr>
                  <th scope="row" className="px-3 py-3 font-mono font-normal">{row.id}</th>
                  <td className="px-3 py-3 font-mono">{row.analyte}</td>
                  <td className="px-3 py-3">{row.inputText} {row.inputUnit}</td>
                  <td className="px-3 py-3">{row.canonicalText !== null ? `${row.canonicalText} ${row.canonicalUnit}` : '—'}</td>
                  <td className="px-3 py-3">{row.significantFigures ?? '—'}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-1 font-semibold ${conversionOutcomeStyles[row.outcome]}`}>{row.outcome}</span>
                  </td>
                </tr>
                {row.outcome === 'refused' ? (
                  <tr>
                    <td colSpan={6} className="px-3 pb-3 text-slate-500">{row.errorCode}: {row.explanation}</td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-x-auto">
        <h3 className="font-semibold text-teal-800">Declared interference tolerance table (fabricated)</h3>
        <table className="mt-3 w-full min-w-[880px] text-left text-xs">
          <caption className="pb-2 text-left text-xs text-slate-500">
            Fabricated per-analyte comment and suppress thresholds; a null entry means that index kind does not affect
            that synthetic analyte.
          </caption>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {['Analyte', 'Hemolysis', 'Icterus', 'Lipemia'].map((label) => (
                <th key={label} scope="col" className="px-3 py-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Object.entries(view.toleranceTable).map(([analyteCode, rules]) => (
              <tr key={analyteCode}>
                <th scope="row" className="px-3 py-3 font-mono font-normal">{analyteCode}</th>
                {(['hemolysis', 'icterus', 'lipemia'] as const).map((kind) => {
                  const rule = rules[kind];
                  return (
                    <td key={kind} className="px-3 py-3">
                      {rule === null
                        ? 'No rule'
                        : `comment ≥ ${rule.commentAt ?? '—'}${rule.commentCode ? ` (${rule.commentCode})` : ''}, suppress ≥ ${rule.suppressAt ?? '—'}`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 space-y-6">
        <h3 className="font-semibold text-teal-800">Specimen interference decisions (fabricated)</h3>
        {view.specimenRows.map((specimen) => (
          <div key={specimen.specimenId} className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-xs">
              <caption className="pb-2 text-left text-xs text-slate-500">
                Specimen {specimen.specimenId} (fabricated) — hemolysis {specimen.hemolysisIndex ?? 'not measured'},
                icterus {specimen.icterusIndex ?? 'not measured'}, lipemia {specimen.lipemiaIndex ?? 'not measured'}.
              </caption>
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {['Analyte', 'Status', 'Reason', 'Comment codes'].map((label) => (
                    <th key={label} scope="col" className="px-3 py-2">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {specimen.decisions.map((decision) => (
                  <Fragment key={decision.analyteCode}>
                    <tr>
                      <th scope="row" className="px-3 py-3 font-mono font-normal">{decision.analyteCode}</th>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-1 font-semibold ${decisionStatusStyles[decision.status]}`}>{decision.status}</span>
                      </td>
                      <td className="px-3 py-3 font-mono">{decision.reasonCode}</td>
                      <td className="px-3 py-3">{decision.commentCodes.length > 0 ? decision.commentCodes.join(', ') : '—'}</td>
                    </tr>
                    {decision.status !== 'report' ? (
                      <tr>
                        <td colSpan={4} className="px-3 pb-3 text-slate-500">
                          {decision.reasonCode === 'index-missing'
                            ? 'A declared index for this synthetic analyte was not measured on this fabricated specimen, so the result is held rather than guessed at.'
                            : decision.reasonCode === 'suppress-threshold-exceeded'
                              ? 'A fabricated interference index reached the declared suppression threshold for this synthetic analyte.'
                              : 'A fabricated interference index reached the declared comment threshold for this synthetic analyte.'}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
