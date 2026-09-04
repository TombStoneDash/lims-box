import { CalendarDays, CheckCircle2, ShieldCheck, Users } from 'lucide-react';
import { requirePrincipal } from '@/lib/ohworks-tenant/auth';
import { hasPermission } from '@/lib/ohworks-tenant/permissions';
import { readTenantStore, visibleStore } from '@/lib/ohworks-tenant/store';
import { PageHeading } from '../_components/page-heading';

export const dynamic = 'force-dynamic';

export default async function PersonnelPage() {
  const principal = await requirePrincipal();
  const store = visibleStore(await readTenantStore(), principal);
  if (!hasPermission(principal, 'personnel:read')) return <div className="space-y-7"><PageHeading eyebrow="Quality management" title="Personnel" description="Training and competency records are restricted for this role." /><div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Personnel access is restricted for this account.</div></div>;
  return <div className="space-y-7"><PageHeading eyebrow="Quality management" title="Personnel and competency" description="Review role assignments, instrument authorizations, and upcoming competency dates." /><section className="grid gap-4 lg:grid-cols-3">{store.personnel.map((person) => <article key={person.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div className="rounded-xl bg-teal-50 p-2.5 text-teal-700"><Users className="h-5 w-5" /></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${person.competency === 'Current' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{person.competency}</span></div><h2 className="mt-5 text-lg font-semibold">{person.name}</h2><p className="mt-1 text-sm text-slate-500">{person.jobTitle}</p><dl className="mt-5 space-y-4 border-t border-slate-100 pt-4 text-sm"><div><dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><ShieldCheck className="h-4 w-4" /> Authorization</dt><dd className="mt-1 text-slate-700">{person.instrumentAuthorization}</dd></div><div><dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><CalendarDays className="h-4 w-4" /> Next review</dt><dd className="mt-1 text-slate-700">{person.nextReview}</dd></div></dl></article>)}</section><section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-2 text-emerald-900"><CheckCircle2 className="h-5 w-5" /><h2 className="font-semibold">Authorization coverage</h2></div><p className="mt-2 text-sm text-emerald-900">Reception, LIAISON XL operation, technical review, and release approval each have current named coverage.</p></section></div>;
}
