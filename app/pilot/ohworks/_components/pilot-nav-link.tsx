'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

interface PilotNavLinkProps {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function PilotNavLink({ href, label, icon: Icon }: PilotNavLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const role = params.get('role');
  if (!role) {
    params.set('role', 'worker');
  }

  const target = `${href}?${params.toString()}`;
  const active = pathname === href;

  return (
    <Link
      href={target}
      className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
        active
          ? 'border-teal-600 text-slate-950'
          : 'border-transparent text-slate-600 hover:border-teal-500 hover:text-slate-950'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
