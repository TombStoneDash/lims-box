import { Activity, FileInput, ServerCog } from 'lucide-react';
import { requirePrincipal } from '@/lib/ohworks-tenant/auth';
import { readTenantStore, visibleStore } from '@/lib/ohworks-tenant/store';
import { LaboratoryUnavailable } from '../_components/laboratory-unavailable';
import { PageHeading } from '../_components/page-heading';

export const dynamic = 'force-dynamic';

export default async function InstrumentPage() {
  const principal = await requirePrincipal();
  const store = visibleStore(await readTenantStore(), principal);
  if (!store.laboratory.available) return <div className="space-y-7"><PageHeading eyebrow="Instrument operations" title="Instrument status" description="Instrument state is read from SENAITE." /><LaboratoryUnavailable /></div>;
  return <div className="space-y-7"><PageHeading eyebrow="Instrument operations" title="SENAITE instruments" description="Configured instrument records and laboratory worklist state from SENAITE." /><section className="grid gap-4 lg:grid-cols-3">{store.instruments.map((instrument) => <article key={instrument.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Activity className="h-5 w-5 text-teal-700" /><p className="mt-4 text-sm text-slate-500">{instrument.name || instrument.id}</p><p className="mt-1 text-xl font-semibold">{instrument.status}</p><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-slate-500"><ServerCog className="mr-1 inline h-4 w-4" /> Worklist</dt><dd>{instrument.queueDepth}</dd></div><div className="flex justify-between"><dt className="text-slate-500"><FileInput className="mr-1 inline h-4 w-4" /> Result channel</dt><dd>{instrument.connection}</dd></div></dl></article>)}</section><p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">Result entry is not available in this interface. The established SENAITE importer is the sole result writer and submits results as awaiting verification.</p></div>;
}
