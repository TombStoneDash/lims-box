import Link from 'next/link';
import { FileCheck2 } from 'lucide-react';
import { requirePrincipal } from '@/lib/ohworks-tenant/auth';
import { hasPermission } from '@/lib/ohworks-tenant/permissions';
import { readTenantStore, visibleStore } from '@/lib/ohworks-tenant/store';
import { PageHeading } from '../_components/page-heading';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const principal = await requirePrincipal();
  const store = visibleStore(await readTenantStore(), principal);
  if (!hasPermission(principal, 'report:read')) return <div className="space-y-7"><PageHeading eyebrow="Reporting" title="Released reports" description="Released report access is restricted for this role." /><div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Report access is restricted for this account.</div></div>;
  const released = store.samples.filter((sample) => sample.release);
  return <div className="space-y-7"><PageHeading eyebrow="Reporting" title="Released reports" description="Open finalized result reports with their technical review and release record." /><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-100">{released.map((sample) => <Link href={`/pilot/ohworks/reports/${sample.release?.reportId}`} key={sample.id} className="grid gap-3 px-5 py-4 hover:bg-slate-50 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-center"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><FileCheck2 className="h-5 w-5" /></div><div><p className="font-mono text-sm font-semibold">{sample.release?.reportId}</p><p className="mt-1 text-xs text-slate-500">{sample.id} · {sample.orderId}</p></div><div><p className="text-sm font-medium">{sample.panel}</p><p className="mt-1 text-xs text-slate-500">Released by {sample.release?.actor}</p></div><span className="text-sm font-semibold text-teal-700">View report</span></Link>)}</div></section></div>;
}
