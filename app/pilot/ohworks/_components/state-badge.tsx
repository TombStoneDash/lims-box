import type { SampleState } from '@/lib/ohworks-tenant/model';

const styles: Record<SampleState, string> = {
  Accessioned: 'bg-slate-100 text-slate-700 ring-slate-200',
  Queued: 'bg-sky-50 text-sky-700 ring-sky-200',
  'Awaiting verification': 'bg-violet-50 text-violet-700 ring-violet-200',
  Unknown: 'bg-slate-50 text-slate-700 ring-slate-200',
  'Retest requested': 'bg-amber-50 text-amber-800 ring-amber-200',
  Quarantined: 'bg-rose-50 text-rose-700 ring-rose-200',
  Rejected: 'bg-red-100 text-red-800 ring-red-200',
  'Technical review': 'bg-orange-50 text-orange-800 ring-orange-200',
  Released: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export function StateBadge({ state }: { state: SampleState }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles[state]}`}>{state}</span>;
}
