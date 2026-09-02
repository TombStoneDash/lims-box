import { AlertTriangle, ClipboardCheck, FileCheck2, LockKeyhole } from 'lucide-react';
import { auditEvents, discoveryGates, readinessRows } from '@/lib/ohworks-pilot';

export default function OHWorksAuditReadiness() {
  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Evidence, not certification</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Audit and pilot readiness</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          This page records what the prototype can evidence, what remains unknown, and who must decide it.
          It does not certify compliance, accreditation, validation, security, or customer readiness.
        </p>
      </div>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-teal-700" /><h2 className="text-lg font-semibold">Discovery decision log</h2></div>
          <div className="mt-5 space-y-3">
            {discoveryGates.map((gate, index) => (
              <div key={gate.area} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">{index + 1}</span><div><h3 className="text-sm font-semibold">{gate.area}</h3><p className="mt-2 text-xs leading-5 text-slate-600">{gate.question}</p><p className="mt-2 text-xs font-semibold text-teal-700">Decision owner: {gate.owner}</p></div></div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-teal-700" /><h2 className="text-lg font-semibold">Synthetic audit events</h2></div>
          <div className="mt-5 space-y-4">
            {auditEvents.map((event) => (
              <div key={`${event.at}-${event.action}`} className="relative border-l-2 border-teal-200 pl-5">
                <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-teal-500 ring-4 ring-white" />
                <p className="font-mono text-xs text-slate-400">{event.at}</p>
                <p className="mt-1 text-sm font-semibold">{event.action}</p>
                <p className="mt-1 text-xs text-slate-600">{event.object}</p>
                <p className="mt-1 text-xs font-medium text-teal-700">Actor: {event.actor}</p>
              </div>
            ))}
          </div>
          <div className="mt-7 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
            A real pilot must define immutable event fields, clock source, actor identity, reason-for-change,
            retention, export format, access review, and amendment behavior.
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4"><LockKeyhole className="h-5 w-5 text-teal-700" /><h2 className="font-semibold">Capability evidence matrix</h2></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-3">Capability</th><th className="px-4 py-3">Current state</th><th className="px-4 py-3">Evidence</th></tr></thead><tbody className="divide-y divide-slate-100">{readinessRows.map((row) => <tr key={row.capability}><td className="px-6 py-4 font-medium">{row.capability}</td><td className="px-4 py-4 text-slate-600">{row.state}</td><td className="px-4 py-4 text-slate-500">{row.evidence}</td></tr>)}</tbody></table></div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-center gap-2 text-amber-900"><AlertTriangle className="h-5 w-5" /><h2 className="font-semibold">Real-data stop</h2></div>
        <p className="mt-3 text-sm leading-6 text-amber-950">
          Do not load patient, employee-health, customer, or production instrument data until the approved data class,
          legal basis, processor responsibilities, security architecture, named users, retention, backup, incident response,
          validation plan, and customer acceptance are documented and authorized.
        </p>
      </section>
    </div>
  );
}
