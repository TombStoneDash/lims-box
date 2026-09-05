import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, FlaskConical } from 'lucide-react';
import { requirePrincipal } from '@/lib/ohworks-tenant/auth';
import { readTenantStore, visibleStore } from '@/lib/ohworks-tenant/store';
import { LaboratoryUnavailable } from './_components/laboratory-unavailable';
import { PageHeading } from './_components/page-heading';
import { StateBadge } from './_components/state-badge';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const principal = await requirePrincipal();
  const store = visibleStore(await readTenantStore(), principal);
  if (!store.laboratory.available) return <div className="space-y-7"><PageHeading eyebrow="Laboratory operations" title="OHWorks laboratory" description="Live laboratory state is read from SENAITE." /><LaboratoryUnavailable /></div>;
  const released = store.samples.filter((sample) => sample.state === 'Released').length;
  const review = store.samples.filter((sample) => sample.state === 'Awaiting verification' || sample.state === 'Technical review').length;
  const exceptions = store.samples.filter((sample) => sample.state === 'Quarantined' || sample.state === 'Retest requested' || sample.state === 'Rejected').length;
  const queued = store.samples.filter((sample) => sample.state === 'Queued').length;
  const cards = [
    { label: 'In SENAITE queue', value: queued, icon: Clock3, tone: 'text-sky-700 bg-sky-50' },
    { label: 'Awaiting review', value: review, icon: FlaskConical, tone: 'text-violet-700 bg-violet-50' },
    { label: 'Exceptions', value: exceptions, icon: AlertTriangle, tone: 'text-rose-700 bg-rose-50' },
    { label: 'Released', value: released, icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50' },
  ];
  return <div className="space-y-7"><PageHeading eyebrow="Laboratory operations" title="OHWorks laboratory" description="Monitor SENAITE samples from receipt through importer submission, technical review, and release." /><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, tone }) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div><div className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5" /></div></div></div>)}</section><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold">SENAITE work</h2><p className="mt-1 text-xs text-slate-500">Most recent records requiring attention</p></div><Link href="/pilot/ohworks/samples" className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700">All samples <ArrowRight className="h-4 w-4" /></Link></div><div className="divide-y divide-slate-100">{store.samples.filter((sample) => sample.state !== 'Released').slice(0, 6).map((sample) => <Link key={sample.uid} href={`/pilot/ohworks/samples#${sample.id}`} className="grid gap-2 px-5 py-4 hover:bg-slate-50 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><p className="font-mono text-sm font-semibold">{sample.id}</p><p className="mt-1 text-xs text-slate-500">{sample.orderId || 'No order reference'} · {sample.subjectReference || 'No subject reference'}</p></div><p className="text-sm">{sample.panel || 'SENAITE analysis request'}</p><StateBadge state={sample.state} /></Link>)}</div></section></div>;
}
