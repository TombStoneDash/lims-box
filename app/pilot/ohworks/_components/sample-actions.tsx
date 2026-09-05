'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SampleAction, SampleState, TenantPermission } from '@/lib/ohworks-tenant/model';

const actionDetails: Partial<Record<SampleState, { action: SampleAction; permission: TenantPermission; label: string }[]>> = {
  Accessioned: [{ action: 'queue', permission: 'sample:queue', label: 'Add to worklist' }],
  Queued: [{ action: 'quarantine', permission: 'result:quarantine', label: 'Quarantine' }, { action: 'reject', permission: 'result:reject', label: 'Reject sample' }],
  'Awaiting verification': [
    { action: 'technical_review', permission: 'result:review', label: 'Complete technical review' },
    { action: 'request_retest', permission: 'result:retest', label: 'Request retest' },
    { action: 'quarantine', permission: 'result:quarantine', label: 'Quarantine' },
    { action: 'reject', permission: 'result:reject', label: 'Reject sample' },
  ],
  'Technical review': [
    { action: 'release', permission: 'result:release', label: 'Approve and release' },
    { action: 'request_retest', permission: 'result:retest', label: 'Return for retest' },
    { action: 'quarantine', permission: 'result:quarantine', label: 'Quarantine' },
  ],
  'Retest requested': [{ action: 'queue', permission: 'sample:queue', label: 'Queue retest' }],
  Quarantined: [{ action: 'queue', permission: 'sample:queue', label: 'Resolve and requeue' }],
};

async function callAction(action: SampleAction, sampleId: string) {
  const response = await fetch('/pilot/ohworks/api/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, sampleId }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'The action could not be completed.');
}

export function SampleActions({ sampleId, state, permissions }: { sampleId: string; state: SampleState; permissions: readonly TenantPermission[] }) {
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const actions = (actionDetails[state] ?? []).filter((item) => permissions.includes(item.permission));
  if (!actions.length) return null;
  return <div className="mt-4"><div className="flex flex-wrap gap-2">{actions.map((item) => <button disabled={pending} key={item.action} onClick={() => { setError(''); startTransition(async () => { try { await callAction(item.action, sampleId); router.refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Action failed'); } }); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-800 disabled:opacity-50">{pending ? 'Saving…' : item.label}</button>)}</div>{error ? <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p> : null}</div>;
}
