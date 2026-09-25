import { AlertTriangle, BadgeCheck, CalendarClock, UserCheck } from 'lucide-react';
import { getVisiblePersonnel, resolveRoleView } from '@/lib/ohworks-pilot';
import { buildPilotReleaseAuthorizationView } from '@/lib/ohworks-demo-release-authorization-view';
import { CapaWorksheetPanel } from '@/app/pilot/ohworks/_components/capa-worksheet-panel';

interface PageProps {
  searchParams?: Promise<{ role?: string }>;
}

export default async function OHWorksPersonnelPilot({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const role = resolveRoleView(params?.role);
  const visiblePersonnel = getVisiblePersonnel(role.id);
  const releaseAuthorization = buildPilotReleaseAuthorizationView();

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Synthetic demonstration data only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Training, competence, and authorization</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          Synthetic personnel evidence is role-filtered with the same tenant and data-class policy as the sample views
          and the assistant. Outcome-only roles do not receive personnel detail, review authority, or release authority.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ['3', 'Synthetic roles', UserCheck, 'No real OHWorks staff, patient, or employee-health identities are present.'],
          ['1', 'Release-capable actor', BadgeCheck, 'Only the technical reviewer fixture can record synthetic release events.'],
          [String(visiblePersonnel.length), 'Visible records', CalendarClock, `Current role: ${role.label}`],
        ].map(([value, label, Icon, note]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-3xl font-semibold">{String(value)}</p>
                <p className="mt-1 text-sm font-semibold">{String(label)}</p>
              </div>
              <Icon className="h-6 w-6 text-teal-700" />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">{String(note)}</p>
          </div>
        ))}
      </section>

      {visiblePersonnel.length > 0 ? (
        <section className="space-y-4">
          {visiblePersonnel.map((person) => (
            <article key={person.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-700">
                    {person.name.split(' ').map((part) => part[0]).join('')}
                  </div>
                  <div>
                    <h2 className="font-semibold">{person.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">{person.role} · {person.actorId}</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3 lg:min-w-[700px]">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Competency</p>
                    <p className="mt-1 text-sm">{person.competency}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Authorization</p>
                    <p className="mt-1 text-sm">{person.authorization}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Next review</p>
                    <p className="mt-1 font-mono text-sm">{person.nextReview}</p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Role-filtered restriction</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {role.label} is limited to outcome-only synthetic records. Personnel, review authorization,
            and release authority details are intentionally hidden in this demo role.
          </p>
        </section>
      )}

      {visiblePersonnel.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-teal-700">Release authorization and device lockout (fabricated)</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Fabricated analysts, competencies and devices evaluated by the real rule modules at a fixed demo timestamp;
            this is a rule demonstration, not authentication and not a real authorization record. Every value and outcome
            below is synthetic. Competency periods, suspension windows and QC frequencies are fabricated examples,
            not regulatory guidance. No real SENAITE server or customer data is used.
          </p>
          <p className="mt-2 text-xs text-slate-600">Fixed synthetic evaluation timestamp: {releaseAuthorization.now}</p>
          <p className="mt-4 font-semibold text-teal-800">
            Refused synthetic releases: {releaseAuthorization.counts.refusedReleases} · Locked synthetic devices: {releaseAuthorization.counts.lockedDevices}
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-xs">
              <caption className="pb-2 text-left text-sm font-semibold text-teal-700">Fabricated release attempts — all inputs and outcomes are synthetic</caption>
              <thead className="bg-slate-50 text-slate-600">
                <tr>{['Result ID', 'Method', 'Flag', 'Analyst ID', 'Decision', 'Rule explanation'].map((label) => <th key={label} scope="col" className="px-3 py-2">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {releaseAuthorization.releaseRows.map((row) => (
                  <tr key={row.resultId}>
                    <th scope="row" className="px-3 py-3 font-mono font-normal">{row.resultId}</th>
                    <td className="px-3 py-3">{row.method}</td>
                    <td className="px-3 py-3">{row.flag}</td>
                    <td className="px-3 py-3 font-mono">{row.analystId}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 font-semibold ${row.decision === 'REFUSED' ? 'bg-amber-50 text-amber-800' : 'bg-teal-50 text-teal-700'}`}>{row.decision}</span></td>
                    <td className="px-3 py-3 text-slate-600">{row.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-xs">
              <caption className="pb-2 text-left text-sm font-semibold text-teal-700">Fabricated point-of-care devices — all inputs and outcomes are synthetic</caption>
              <thead className="bg-slate-50 text-slate-600">
                <tr>{['Device ID', 'Last QC result', 'Hours since last QC', 'Locked', 'Supervisor override required', 'Reason'].map((label) => <th key={label} scope="col" className="px-3 py-2">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {releaseAuthorization.deviceRows.map((row) => (
                  <tr key={row.deviceId}>
                    <th scope="row" className="px-3 py-3 font-mono font-normal">{row.deviceId}</th>
                    <td className="px-3 py-3">{row.lastQcResult}</td>
                    <td className="px-3 py-3 tabular-nums">{row.hoursSinceLastQc}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 font-semibold ${row.locked ? 'bg-amber-50 text-amber-800' : 'bg-teal-50 text-teal-700'}`}>{row.locked ? 'Yes' : 'No'}</span></td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 font-semibold ${row.overrideRequired ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{row.overrideRequired ? 'Yes' : 'No'}</span></td>
                    <td className="px-3 py-3 text-slate-600">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-center gap-2 text-amber-900">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="font-semibold">Discovery still required for real users</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-amber-950">
          A real pilot still needs named users, joiner-mover-leaver rules, server-enforced authorization,
          assessor and release policies, evidence retention, periodic review, and acceptance ownership.
        </p>
      </section>

      <CapaWorksheetPanel />
    </div>
  );
}
