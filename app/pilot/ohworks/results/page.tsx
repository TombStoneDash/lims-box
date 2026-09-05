import { requirePrincipal } from '@/lib/ohworks-tenant/auth';
import { hasPermission, permissionsFor } from '@/lib/ohworks-tenant/permissions';
import { readTenantStore, visibleStore } from '@/lib/ohworks-tenant/store';
import { LaboratoryUnavailable } from '../_components/laboratory-unavailable';
import { SampleActions } from '../_components/sample-actions';
import { PageHeading } from '../_components/page-heading';
import { StateBadge } from '../_components/state-badge';

export const dynamic = 'force-dynamic';

export default async function ResultsPage() {
  const principal = await requirePrincipal();
  const store = visibleStore(await readTenantStore(), principal);
  const permissions = permissionsFor(principal.role);
  if (!store.laboratory.available) return <div className="space-y-7"><PageHeading eyebrow="Result management" title="Result review" description="Results are read from SENAITE." /><LaboratoryUnavailable /></div>;
  if (!hasPermission(principal, 'result:read')) return <div className="space-y-7"><PageHeading eyebrow="Result management" title="Result review" description="Your account does not include access to result values or technical review." /><div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Result access is restricted for this role.</div></div>;
  const samples = store.samples.filter((sample) => sample.results.length > 0 && sample.state !== 'Released');
  return <div className="space-y-7"><PageHeading eyebrow="Result management" title="Result review" description="Review values accepted by the established importer into SENAITE as awaiting verification." /><section className="space-y-4">{samples.map((sample) => <article key={sample.uid} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono text-sm font-semibold">{sample.id}</p><h2 className="mt-1 font-semibold">{sample.panel || 'SENAITE analysis request'}</h2><p className="mt-1 text-xs text-slate-500">{sample.subjectReference || 'No subject reference supplied'}</p></div><StateBadge state={sample.state} /></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3">Analyte</th><th className="pb-3">Result</th><th className="pb-3">Unit</th><th className="pb-3">SENAITE state</th></tr></thead><tbody className="divide-y divide-slate-100">{sample.results.map((result) => <tr key={result.uid}><td className="py-3"><p className="font-medium">{result.analyte || result.code}</p><p className="text-xs text-slate-500">{result.code}</p></td><td className="py-3 font-semibold">{result.value}</td><td className="py-3 text-slate-600">{result.units || 'Not supplied'}</td><td className="py-3">{result.reviewState}</td></tr>)}</tbody></table></div>{sample.review ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">Technical review recorded in SENAITE by {sample.review.actor}.</p> : null}<SampleActions sampleId={sample.id} state={sample.state} permissions={permissions} /></article>)}</section></div>;
}
