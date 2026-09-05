import { ClipboardCheck } from 'lucide-react';
import { requirePrincipal } from '@/lib/ohworks-tenant/auth';
import { hasPermission } from '@/lib/ohworks-tenant/permissions';
import { readTenantStore, visibleStore } from '@/lib/ohworks-tenant/store';
import { PageHeading } from '../_components/page-heading';
import { LaboratoryUnavailable } from '../_components/laboratory-unavailable';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const principal = await requirePrincipal();
  const store = visibleStore(await readTenantStore(), principal);
  if (!store.laboratory.available) return <div className="space-y-7"><PageHeading eyebrow="Quality management" title="Audit history" description="Laboratory audit history is read from SENAITE." /><LaboratoryUnavailable /></div>;
  if (!hasPermission(principal, 'audit:read')) return <div className="space-y-7"><PageHeading eyebrow="Quality management" title="Audit history" description="Detailed event history is restricted for this role." /><div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Audit access is restricted for this account.</div></div>;
  return <div className="space-y-7"><PageHeading eyebrow="Quality management" title="Audit history" description="Trace sample, result, review, and release activity with named actors and timestamps." /><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-teal-700" /><h2 className="font-semibold">Recent events</h2></div><div className="space-y-5">{store.audit.map((event) => <article key={event.id} className="relative border-l-2 border-teal-200 pl-5"><span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-teal-500 ring-4 ring-white" /><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold">{event.action}</p><p className="mt-1 font-mono text-xs text-teal-700">{event.objectId}</p></div><time className="text-xs text-slate-400">{new Date(event.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC</time></div><p className="mt-2 text-sm text-slate-600">{event.detail}</p><p className="mt-1 text-xs text-slate-500">Actor: {event.actor}</p></article>)}</div></section></div>;
}
