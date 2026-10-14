'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Activity, Bot, ClipboardCheck, FlaskConical, Gauge, ShieldAlert, Users } from 'lucide-react';

import { isPilotNavActive } from '@/lib/ohworks-pilot-nav-state';

const icons = {
  activity: Activity,
  bot: Bot,
  clipboard: ClipboardCheck,
  flask: FlaskConical,
  gauge: Gauge,
  shieldAlert: ShieldAlert,
  users: Users,
} as const;

interface PilotNavLinkProps {
  href: string;
  label: string;
  icon: keyof typeof icons;
}

export function PilotNavLink({ href, label, icon }: PilotNavLinkProps) {
  const Icon = icons[icon];
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  const role = params.get('role');
  if (!role) {
    params.set('role', 'worker');
  }

  const target = `${href}?${params.toString()}`;
  const active = isPilotNavActive(pathname, href);

  return (
    <Link
      href={target}
      aria-current={active ? 'page' : undefined}
      className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
        active
          ? 'border-teal-600 bg-teal-50 font-semibold text-slate-950'
          : 'border-transparent text-slate-600 hover:border-teal-500 hover:text-slate-950'
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
