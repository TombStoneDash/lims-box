import { AlertTriangle, BadgeCheck, CalendarClock, UserCheck } from 'lucide-react';
import { getVisiblePersonnel, resolveRoleView } from '@/lib/ohworks-pilot';

interface PageProps {
  searchParams?: Promise<{ role?: string }>;
}

export default async function OHWorksPersonnelPilot({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const role = resolveRoleView(params?.role);
  const visiblePersonnel = getVisiblePersonnel(role.id);

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
    </div>
  );
}
