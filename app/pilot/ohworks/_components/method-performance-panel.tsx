import { buildPilotMethodPerformanceView, isUnresolvedComparisonRow } from '@/lib/ohworks-demo-method-performance-view';

const statusStyles: Record<string, string> = {
  reported: 'bg-emerald-50 text-emerald-800',
  reported_with_flag: 'bg-amber-50 text-amber-800',
  blocked: 'bg-rose-50 text-rose-800',
  pass: 'bg-emerald-50 text-emerald-800',
  fail: 'bg-rose-50 text-rose-800',
  acceptable: 'bg-emerald-50 text-emerald-800',
  'not-acceptable': 'bg-rose-50 text-rose-800',
  unresolved: 'bg-rose-50 text-rose-800',
};

const cell = 'px-4 py-4';
const table = 'w-full min-w-[800px] text-left text-sm';
const heading = 'bg-slate-50 text-xs uppercase tracking-wide text-slate-500';

function Pill({ label, tone }: { label: string; tone: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}

/** Read-only synthetic panel; no instrument, LIMS write or accreditation body is involved. */
export function MethodPerformancePanel() {
  const view = buildPilotMethodPerformanceView();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Method performance: validation status, linearity and method comparison (fabricated)</h2>
      <p className="mt-3 text-sm text-slate-600">
        A fabricated method validation registry, fabricated linearity limits and fabricated paired values are evaluated by the
        real rule modules at a fixed demo timestamp. A blocked or failing row would be routed to human review; this panel
        confirms no method&rsquo;s validation status and reports nothing to a real customer.
      </p>
      <p className="mt-2 text-xs text-slate-500">Fixed synthetic run timestamp: {view.runAt}. Every registry entry, limit and paired value shown is a fabricated example, not regulatory guidance.</p>

      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <p className="rounded-xl bg-teal-50 p-4">Synthetic runs blocked: <strong>{view.counts.runsBlocked}</strong></p>
        <p className="rounded-xl bg-teal-50 p-4">Synthetic linearity sets not passing: <strong>{view.counts.linearitySetsNotPassing}</strong></p>
        <p className="rounded-xl bg-teal-50 p-4">Synthetic comparisons not acceptable or unresolved: <strong>{view.counts.comparisonsNotAcceptable}</strong></p>
      </div>

      <div className="mt-6">
        <h3 className="font-semibold text-teal-800">Method validation status (fabricated)</h3>
        <div className="mt-3 overflow-x-auto">
          <table className={table}>
            <caption className="pb-3 text-left text-xs text-slate-500">
              Fabricated method registry evaluated at the fixed synthetic run timestamp above; reported is a rule outcome, not permission to report a real result.
            </caption>
            <thead className={heading}>
              <tr>
                <th scope="col" className={cell}>Fabricated method</th>
                <th scope="col" className={cell}>Fabricated matrix</th>
                <th scope="col" className={cell}>Synthetic decision</th>
                <th scope="col" className={cell}>Rule explanation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {view.validationRows.map((row) => (
                <tr key={row.methodId}>
                  <th scope="row" className={`${cell} font-mono text-xs`}>{row.methodId}</th>
                  <td className={`${cell} text-xs text-slate-600`}>{row.matrix}</td>
                  <td className={`${cell} text-xs text-slate-600`}>
                    <Pill label={row.decision} tone={statusStyles[row.decision]} />
                    {row.decision !== 'reported' && <p className="mt-2 text-xs text-slate-500">{row.reasonCode}: {row.reason}</p>}
                  </td>
                  <td className={`${cell} text-xs text-slate-600`}>{row.reasonCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="font-semibold text-teal-800">Linearity verification (fabricated)</h3>
        <div className="mt-3 overflow-x-auto">
          <table className={table}>
            <caption className="pb-3 text-left text-xs text-slate-500">
              Fabricated calibrator levels evaluated against fabricated acceptance limits; slope, intercept and correlation are rounded to four decimals for display only.
            </caption>
            <thead className={heading}>
              <tr>
                <th scope="col" className={cell}>Fabricated set</th>
                <th scope="col" className={cell}>Synthetic decision</th>
                <th scope="col" className={cell}>Synthetic slope</th>
                <th scope="col" className={cell}>Synthetic intercept</th>
                <th scope="col" className={cell}>Synthetic correlation</th>
                <th scope="col" className={cell}>Per-level recovery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {view.linearityRows.map((row) => (
                <tr key={row.setId}>
                  <th scope="row" className={`${cell} font-mono text-xs`}>{row.setId}</th>
                  <td className={`${cell} text-xs text-slate-600`}>
                    <Pill label={row.decision} tone={statusStyles[row.decision]} />
                    {row.decision !== 'pass' && <p className="mt-2 text-xs text-slate-500">{row.reasonCode}: {row.reason}</p>}
                  </td>
                  <td className={`${cell} tabular-nums text-xs text-slate-600`}>{row.slopeDisplay}</td>
                  <td className={`${cell} tabular-nums text-xs text-slate-600`}>{row.interceptDisplay}</td>
                  <td className={`${cell} tabular-nums text-xs text-slate-600`}>{row.correlationDisplay}</td>
                  <td className={`${cell} text-xs text-slate-600`}>
                    {row.levelRecoveries.length === 0 ? (
                      <span>No levels evaluated.</span>
                    ) : (
                      <ul className="space-y-1">
                        {row.levelRecoveries.map((level) => (
                          <li key={level.levelId}>
                            <Pill label={level.withinLimits ? 'within limits' : 'out of limits'} tone={level.withinLimits ? statusStyles.pass : statusStyles.fail} />
                            {' '}{level.levelId}: {level.recoveryPercent.toFixed(2)}%
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="font-semibold text-teal-800">Method comparison (fabricated)</h3>
        <div className="mt-3 overflow-x-auto">
          <table className={table}>
            <caption className="pb-3 text-left text-xs text-slate-500">
              Fabricated paired reference/candidate values; mean difference, percent bias and limits of agreement are computed by the real evaluator. A set with fewer pairs than the declared minimum is shown unresolved.
            </caption>
            <thead className={heading}>
              <tr>
                <th scope="col" className={cell}>Fabricated set</th>
                <th scope="col" className={cell}>Synthetic pairs</th>
                <th scope="col" className={cell}>Synthetic mean difference</th>
                <th scope="col" className={cell}>Synthetic percent bias</th>
                <th scope="col" className={cell}>Limits of agreement</th>
                <th scope="col" className={cell}>Passing-Bablok slope / intercept</th>
                <th scope="col" className={cell}>Synthetic decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {view.comparisonRows.map((row) => (
                <tr key={row.setId}>
                  <th scope="row" className={`${cell} font-mono text-xs`}>{row.setId}</th>
                  {isUnresolvedComparisonRow(row) ? (
                    <td className={`${cell} text-xs text-slate-600`} colSpan={5}>
                      <Pill label="unresolved" tone={statusStyles.unresolved} />
                      <p className="mt-2 text-xs text-slate-500">{row.code}: {row.explanation}</p>
                    </td>
                  ) : (
                    <>
                      <td className={`${cell} text-xs text-slate-600`}>{row.pairCount}</td>
                      <td className={`${cell} tabular-nums text-xs text-slate-600`}>{row.meanDifference.toFixed(2)}</td>
                      <td className={`${cell} tabular-nums text-xs text-slate-600`}>{row.percentBias === null ? 'Undefined' : `${row.percentBias.toFixed(2)}%`}</td>
                      <td className={`${cell} tabular-nums text-xs text-slate-600`}>{row.limitsOfAgreement.lower.toFixed(2)} to {row.limitsOfAgreement.upper.toFixed(2)}</td>
                      <td className={`${cell} tabular-nums text-xs text-slate-600`}>{row.passingBablok.slope.toFixed(4)} / {row.passingBablok.intercept.toFixed(4)}</td>
                      <td className={`${cell} text-xs text-slate-600`}>
                        <Pill label={row.decision} tone={statusStyles[row.decision]} />
                        {row.decision !== 'acceptable' && <p className="mt-2 text-xs text-slate-500">{row.governingCriterion}: {row.explanation}</p>}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
