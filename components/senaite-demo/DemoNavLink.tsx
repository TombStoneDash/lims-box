'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, TestTubes, Activity, Wrench, GraduationCap } from 'lucide-react';

import { isSenaiteDemoNavCurrent } from '@/lib/senaite-demo-nav-state';

const icons = {
  dashboard: LayoutDashboard,
  sample: TestTubes,
  qc: Activity,
  equipment: Wrench,
  training: GraduationCap,
} as const;

interface DemoNavLinkProps {
  href: string;
  label: string;
  icon: keyof typeof icons;
}

export function DemoNavLink({ href, label, icon }: DemoNavLinkProps) {
  const Icon = icons[icon];
  const pathname = usePathname();
  const current = isSenaiteDemoNavCurrent(pathname, href);

  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors ${
        current
          ? 'border-[#1abc9c] bg-[#2c3e50] font-semibold text-white'
          : 'border-transparent text-slate-300 hover:bg-[#2c3e50] hover:text-white'
      }`}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
