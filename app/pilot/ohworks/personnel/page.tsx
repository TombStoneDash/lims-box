import { AlertTriangle, BadgeCheck, CalendarClock, UserCheck } from 'lucide-react';
import { syntheticPersonnel } from '@/lib/ohworks-pilot';

export default function OHWorksPersonnelPilot() {
  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Synthetic personnel evidence</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Training, competence, and authorization</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          Fictional profiles demonstrate evidence states and role separation. They do not represent OHWorks employees,
          qualifications, clinical scope, or an accreditation determination.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ['3', 'Synthetic people', UserCheck, 'No employee or patient information'],
          ['2', 'Scoped authorizations', BadgeCheck, 'Training does not imply release authority'],
          ['1', 'Review due soon', CalendarClock, 'Fixture for reminder and escalation design'],
        ].map(([value, label, Icon, note]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between"><div><p className="text-3xl font-semibold">{String(value)}</p><p className="mt-1 text-sm font-semibold">{String(label)}</p></div><Icon className="h-6 w-6 text-teal-700" /></div>
            <p className="mt-3 text-xs leading-5 text-slate-500">{String(note)}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        {syntheticPersonnel.map((person) => (
          <article key={person.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-700">{person.name.split(' ').map((part) => part[0]).join('')}</div>
                <div><h2 className="font-semibold">{person.name}</h2><p className="mt-1 text-sm text-slate-500">{person.role} · {person.id}</p></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3 lg:min-w-[700px]">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Competency</p><p className="mt-1 text-sm">{person.competency}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Authorization</p><p className="mt-1 text-sm">{person.authorization}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Next review</p><p className="mt-1 font-mono text-sm">{person.nextReview}</p></div>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-center gap-2 text-amber-900"><AlertTriangle className="h-5 w-5" /><h2 className="font-semibold">Customer decisions still required</h2></div>
        <p className="mt-3 text-sm leading-6 text-amber-950">
          Named roles, assessor rules, authorization scopes, renewal intervals, evidence types, identity source,
          cross-site visibility, notification policy, retention, and export recipients must be defined during discovery.
        </p>
      </section>
    </div>
  );
}
