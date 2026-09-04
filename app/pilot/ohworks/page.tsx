import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, FlaskConical } from 'lucide-react';
import { requirePrincipal } from '@/lib/ohworks-tenant/auth';
import { readTenantStore, visibleStore } from '@/lib/ohworks-tenant/store';
import { PageHeading } from './_components/page-heading';
import { StateBadge } from './_components/state-badge';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const principal = await requirePrincipal();
  const store = visibleStore(await readTenantStore(), principal);
  const released = store.samples.filter((sample) => sample.state === 'Released').length;
  const review = store.samples.filter((sample) => sample.state === 'Result available' || sample.state === 'Technical review').length;
  const exceptions = store.samples.filter((sample) => sample.state === 'Quarantined' || sample.state === 'Retest requested' || sample.state === 'Rejected').length;
  const queued = store.samples.filter((sample) => sample.state === 'Queued').length;
  const cards = [
    { label: 'In instrument queue', value: queued, icon: Clock3, tone: 'text-sky-700 bg-sky-50' },
    { label: 'Awaiting review', value: review, icon: FlaskConical, tone: 'text-violet-700 bg-violet-50' },
    { label: 'Exceptions', value: exceptions, icon: AlertTriangle, tone: 'text-rose-700 bg-rose-50' },
    { label: 'Released today', value: released, icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50' },
  ];
  return <div className="space-y-7">
    <PageHeading eyebrow="Laboratory operations" title="Good morning, OHWorks" description="Monitor samples from receipt through instrument processing, technical review, and report release." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, tone }) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div><div className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5" /></div></div></div>)}</section>
    <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold">Priority work</h2><p className="mt-1 text-xs text-slate-500">Most recently received records requiring attention</p></div><Link href="/pilot/ohworks/samples" className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700">All samples <ArrowRight className="h-4 w-4" /></Link></div><div className="divide-y divide-slate-100">{store.samples.filter((sample) => sample.state !== 'Released').slice(0, 6).map((sample) => <Link key={sample.id} href={`/pilot/ohworks/samples#${sample.id}`} className="grid gap-2 px-5 py-4 hover:bg-slate-50 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><p className="font-mono text-sm font-semibold">{sample.id}</p><p className="mt-1 text-xs text-slate-500">{sample.orderId} · {sample.subjectReference}</p></div><p className="text-sm">{sample.panel}</p><StateBadge state={sample.state} /></Link>)}</div></div>
      <div className="space-y-5"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">LIAISON XL</h2><div className="mt-4 flex items-center gap-2 text-sm text-emerald-700"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Ready</div><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-slate-500">Worklist</dt><dd className="font-medium">{store.instruments[0].queueDepth} sample</dd></div><div className="flex justify-between"><dt className="text-slate-500">Result channel</dt><dd className="font-medium">Test file import</dd></div></dl><Link href="/pilot/ohworks/instrument" className="mt-5 inline-flex text-sm font-semibold text-teal-700">Open instrument status</Link></div><div className="rounded-2xl border border-teal-200 bg-teal-50 p-5"><h2 className="font-semibold text-teal-950">Today’s focus</h2><p className="mt-2 text-sm leading-6 text-teal-900">Resolve the quarantined barcode, complete two technical reviews, and release approved reports.</p></div></div>
    </section>
  </div>;
}
