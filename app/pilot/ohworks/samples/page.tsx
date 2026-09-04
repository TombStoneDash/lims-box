import { requirePrincipal } from '@/lib/ohworks-tenant/auth';
import { permissionsFor } from '@/lib/ohworks-tenant/permissions';
import { readTenantStore, visibleStore } from '@/lib/ohworks-tenant/store';
import { AccessionButton, SampleActions } from '../_components/sample-actions';
import { PageHeading } from '../_components/page-heading';
import { StateBadge } from '../_components/state-badge';

export const dynamic = 'force-dynamic';

export default async function SamplesPage() {
  const principal = await requirePrincipal();
  const store = visibleStore(await readTenantStore(), principal);
  const permissions = permissionsFor(principal.role);
  return <div className="space-y-7">
    <PageHeading eyebrow="Sample management" title="Sample queue" description="Receive specimens, prepare the instrument worklist, and resolve exceptions without leaving the operational queue." action={<AccessionButton permissions={permissions} />} />
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Sample</th><th className="px-4 py-3">Order / subject</th><th className="px-4 py-3">Panel</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Instrument</th><th className="px-4 py-3">Status and actions</th></tr></thead><tbody className="divide-y divide-slate-100">{store.samples.map((sample) => <tr id={sample.id} key={sample.id} className="align-top"><td className="px-5 py-4"><p className="font-mono text-xs font-semibold">{sample.id}</p><p className="mt-1 text-xs text-slate-500">{sample.specimen} · {sample.priority}</p></td><td className="px-4 py-4"><p className="font-medium">{sample.orderId}</p><p className="mt-1 text-xs text-slate-500">{sample.subjectReference}</p></td><td className="px-4 py-4">{sample.panel}</td><td className="px-4 py-4 text-slate-600">{new Date(sample.receivedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })}</td><td className="px-4 py-4"><p>{sample.instrument}</p><p className="mt-1 text-xs text-slate-500">Rack {sample.rackPosition}</p></td><td className="px-4 py-4"><StateBadge state={sample.state} />{sample.exception ? <p className="mt-2 max-w-xs text-xs leading-5 text-rose-700">{sample.exception.reason}</p> : null}<SampleActions sampleId={sample.id} state={sample.state} permissions={permissions} /></td></tr>)}</tbody></table></div></section>
  </div>;
}
