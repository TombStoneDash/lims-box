import { AlertTriangle, ClipboardCheck, Download, FileCheck2, LockKeyhole } from 'lucide-react';
import {
  getVisibleAudit,
  getVisibleDiscoveryRecords,
  readinessRows,
  resolveRoleView,
} from '@/lib/ohworks-pilot';

import { buildPilotAuditIntegrityView } from '@/lib/ohworks-demo-audit-integrity-view';
import { buildPilotQualityEventsView } from '@/lib/ohworks-demo-quality-events-view';

interface PageProps {
  searchParams?: Promise<{ role?: string }>;
}

export default async function OHWorksAuditReadiness({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const role = resolveRoleView(params?.role);
  const visibleAudit = getVisibleAudit(role.id);
  const visibleDiscovery = getVisibleDiscoveryRecords(role.id);
  const qualityEvents = buildPilotQualityEventsView();
  const auditIntegrity = buildPilotAuditIntegrityView();

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Synthetic demonstration data only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Audit and demo readiness</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          This page shows what the local supervised demo can evidence and what still remains unresolved.
          It does not certify compliance, accreditation, validation, or customer readiness.
        </p>
      </div>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-teal-700" />
            <h2 className="text-lg font-semibold">Discovery decision log</h2>
          </div>
          <div className="mt-5 space-y-3">
            {visibleDiscovery.map((gate, index) => (
              <div key={gate.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{gate.area}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{gate.question}</p>
                    <p className="mt-2 text-xs font-semibold text-teal-700">Decision owner: {gate.owner}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-teal-700" />
              <h2 className="text-lg font-semibold">Role-filtered synthetic audit events</h2>
            </div>
            <a
              href={`/pilot/ohworks/audit/export?role=${encodeURIComponent(role.id)}`}
              download={`ohworks-synthetic-audit-${role.id}.csv`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100"
            >
              <Download className="h-4 w-4" />
              Download role-visible CSV
            </a>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Synthetic demonstration data only. The export keeps this role&apos;s current visibility and uses the stable
            columns event_id, occurred_at, actor_id, action, object, and note.
          </p>
          {visibleAudit.length > 0 ? (
            <div className="mt-5 space-y-4">
              {visibleAudit.map((event) => (
                <div key={event.id} className="relative border-l-2 border-teal-200 pl-5">
                  <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-teal-500 ring-4 ring-white" />
                  <p className="font-mono text-xs text-slate-400">{event.at}</p>
                  <p className="mt-1 text-sm font-semibold">{event.action}</p>
                  <p className="mt-1 text-xs text-slate-600">{event.object}</p>
                  <p className="mt-1 text-xs font-medium text-teal-700">Actor: {event.actorId}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{event.note}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
              Current role: {role.label}. This view is restricted to outcome-only synthetic records, so admin audit detail is not rendered.
            </div>
          )}
          <div className="mt-7 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
            A real pilot still needs immutable clock source, actor identity proof, reason-for-change rules,
            retention, export format, access review, and amendment behavior.
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
          <LockKeyhole className="h-5 w-5 text-teal-700" />
          <h2 className="font-semibold">Capability evidence matrix</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Capability</th>
                <th className="px-4 py-3">Current state</th>
                <th className="px-4 py-3">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {readinessRows.map((row) => (
                <tr key={row.capability}>
                  <td className="px-6 py-4 font-medium">{row.capability}</td>
                  <td className="px-4 py-4 text-slate-600">{row.state}</td>
                  <td className="px-4 py-4 text-slate-500">{row.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Quality events (fabricated)</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Fabricated records evaluated by the real lifecycle and diff rules; nothing here is a customer record
          and nothing is written. All values, roles, and timestamps below are synthetic. This panel does not
          connect to a SENAITE server.
        </p>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-teal-800">Fabricated nonconformance timeline</h3>
            <p className="mt-2 text-xs text-slate-600">
              {qualityEvents.record.recordId} · Synthetic final state: {qualityEvents.record.state}
            </p>
            <p className="mt-2 text-xs text-slate-600">
              Synthetic attempts: {qualityEvents.counts.accepted} accepted, {qualityEvents.counts.refused} refused
            </p>
            <ol className="mt-4 space-y-3">
              {qualityEvents.timeline.map((entry) => (
                <li key={entry.occurredAt} className={entry.status === 'refused'
                  ? 'rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950'
                  : 'rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700'}>
                  <p className="break-words text-xs font-semibold">{entry.action.kind} · {entry.status}</p>
                  <p className="mt-1 break-words text-xs">{entry.fromState} → {entry.state}</p>
                  <p className="mt-1 text-xs">Synthetic actor role: {entry.actorRole}</p>
                  <p className="mt-1 break-all font-mono text-xs">{entry.occurredAt}</p>
                  {entry.refusalCode && <p className="mt-2 text-xs font-semibold">{entry.refusalCode}</p>}
                  <p className="mt-2 text-xs leading-5">{entry.explanation}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-teal-800">What changed in the amended report</h3>
            <p className="mt-2 text-xs text-slate-600">Fabricated sample: {qualityEvents.sampleId}</p>
            <p className="mt-2 text-xs text-slate-600">
              Synthetic rows: {qualityEvents.counts.changed} changed, {qualityEvents.counts.added} added,
              {' '}{qualityEvents.counts.unchanged} unchanged; {qualityEvents.counts.significant} significant changes
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <caption className="mb-3 text-left text-slate-500">
                  Fabricated original and amended values. Significance uses synthetic thresholds and flag rules.
                </caption>
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th scope="col" className="p-3">Synthetic analyte</th>
                    <th scope="col" className="p-3">Old</th>
                    <th scope="col" className="p-3">New</th>
                    <th scope="col" className="p-3">Delta</th>
                    <th scope="col" className="p-3">Significant?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {qualityEvents.diffEntries.map((entry) => (
                    <tr key={entry.analyte}>
                      <th scope="row" className="p-3 font-medium">
                        <span className="break-all">{entry.analyte}</span>
                        <span className="mt-1 block text-slate-500">{entry.kind}</span>
                      </th>
                      <td className="p-3">{entry.old}</td>
                      <td className="p-3">{entry.new}</td>
                      <td className="p-3">{entry.delta}</td>
                      <td className="p-3">
                        <span className={entry.significant
                          ? 'inline-block rounded-full bg-teal-100 px-2 py-1 font-semibold text-teal-900'
                          : 'inline-block rounded-full bg-slate-100 px-2 py-1 text-slate-700'}>
                          {entry.significanceLabel}
                        </span>
                        <p className="mt-2 leading-5 text-slate-600">{entry.explanation}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Audit-chain integrity and record retention (fabricated)</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          All chains, records, and values below are fabricated. Retention periods are fabricated examples,
          not regulatory guidance. NOTHING is purged or deleted — the manifest is a preview only.
          No SENAITE server is connected to this panel.
        </p>
        <p className="mt-3 text-sm font-semibold text-teal-800">
          Synthetic totals: {auditIntegrity.counts.brokenChains} broken chains ·{' '}
          {auditIntegrity.counts.recordsEligible} records eligible · {auditIntegrity.counts.recordsHeld} records held
        </p>
        <p className="mt-2 break-all text-xs text-slate-500">Fabricated evaluation time: {auditIntegrity.currentAt}</p>
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="font-semibold text-teal-800">Fabricated audit chains</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <caption className="mb-3 text-left text-slate-500">
                  Fabricated chains only; the synthetic hash is not cryptographic proof. Failure indices start at zero.
                </caption>
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th scope="col" className="p-3">Synthetic scenario</th>
                    <th scope="col" className="p-3">Status</th>
                    <th scope="col" className="p-3">Entries</th>
                    <th scope="col" className="p-3">Final hash / first failure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditIntegrity.chains.map((chain) => (
                    <tr key={chain.label}>
                      <th scope="row" className="p-3 font-medium">{chain.label}</th>
                      <td className="p-3">
                        <span className={chain.status === 'VERIFIED'
                          ? 'inline-block rounded-full bg-teal-100 px-2 py-1 font-semibold text-teal-900'
                          : 'inline-block rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-900'}>
                          {chain.status}
                        </span>
                      </td>
                      <td className="p-3">{chain.entryCount}</td>
                      <td className="p-3">
                        {chain.finalHashPreview && <span className="font-mono">{chain.finalHashPreview}</span>}
                        {chain.failure && <>
                          <p className="font-semibold">Index {chain.failure.entryIndex} · {chain.failure.code}</p>
                          <p className="mt-2 text-slate-600">{chain.reason}</p>
                          <p className="mt-2 text-slate-600">{chain.nextAction}</p>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-teal-800">Fabricated record retention and manifest preview</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <caption className="mb-3 text-left text-slate-500">
                  The chain and records are fabricated; retention periods are fabricated examples, not regulatory guidance.
                  NOTHING is purged or deleted — the manifest is a preview only. Whole days are rounded down;
                  past-end days do not override a hold.
                </caption>
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th scope="col" className="p-3">Synthetic record</th>
                    <th scope="col" className="p-3">Class</th>
                    <th scope="col" className="p-3">Status</th>
                    <th scope="col" className="p-3">Retention end (synthetic)</th>
                    <th scope="col" className="p-3">Whole days remaining / overdue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditIntegrity.records.map((record) => (
                    <tr key={record.recordId}>
                      <th scope="row" className="p-3 font-medium">{record.recordId}</th>
                      <td className="p-3">{record.recordClass}</td>
                      <td className="p-3">
                        <span className={record.evaluation.status === 'held'
                          ? 'inline-block rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-900'
                          : 'inline-block rounded-full bg-teal-100 px-2 py-1 font-semibold text-teal-900'}>
                          {record.evaluation.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono">{record.evaluation.retentionEndDate}</td>
                      <td className="p-3">{record.wholeDays} {record.dayDirection}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-xs">
                <caption className="mb-3 text-left text-slate-500">Fabricated purge-manifest attempts — preview only, no deletion.</caption>
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th scope="col" className="p-3">Synthetic records requested</th>
                    <th scope="col" className="p-3">Outcome</th>
                    <th scope="col" className="p-3">Explanation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditIntegrity.purgeAttempts.map((attempt) => (
                    <tr key={attempt.status}>
                      <th scope="row" className="p-3 font-medium">{attempt.recordIds.join(', ')}</th>
                      <td className="p-3">
                        <span className={attempt.status === 'refused'
                          ? 'inline-block rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-900'
                          : 'inline-block rounded-full bg-teal-100 px-2 py-1 font-semibold text-teal-900'}>
                          {attempt.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {attempt.code && <p className="font-semibold">{attempt.code}</p>}
                        <p className="mt-1 text-slate-600">{attempt.explanation}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-center gap-2 text-amber-900">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="font-semibold">Real-data stop</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-amber-950">
          Do not load patient, employee-health, customer, or production instrument data until the legal basis,
          security model, supplier approvals, validation plan, and customer acceptance are documented and authorized.
        </p>
      </section>
    </div>
  );
}
