'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { getRoleViews } from '@/lib/ohworks-pilot';

export function RoleSwitch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const roles = getRoleViews();
  const currentRole = searchParams.get('role') ?? roles[0]?.id ?? 'worker';

  return (
    <section className="rounded-2xl border border-teal-200 bg-teal-50/80 p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800 ring-1 ring-teal-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Demo role simulator - not authentication
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            This switch changes the synthetic view only. It does not prove identity, entitlement,
            or any server-enforced access control.
          </p>
        </div>

        <label className="flex min-w-[260px] flex-col gap-2 text-sm font-medium text-slate-700">
          Synthetic role
          <select
            value={currentRole}
            onChange={(event) => {
              const params = new URLSearchParams(searchParams.toString());
              params.set('role', event.target.value);
              startTransition(() => {
                router.replace(`${pathname}?${params.toString()}`, { scroll: false });
              });
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 focus:border-teal-500"
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">
            {roles.find((role) => role.id === currentRole)?.note}
            {isPending ? ' Updating view...' : ''}
          </span>
        </label>
      </div>
    </section>
  );
}
