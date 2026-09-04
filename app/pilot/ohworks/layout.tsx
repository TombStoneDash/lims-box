import { Activity, LogOut } from 'lucide-react';
import { getPrincipal } from '@/lib/ohworks-tenant/auth';
import { roleLabel } from '@/lib/ohworks-tenant/permissions';
import { PilotNavLink } from './_components/pilot-nav-link';
import { TestEnvironmentBadge } from './_components/test-environment-badge';

const nav = [
  { href: '/pilot/ohworks', label: 'Dashboard', icon: 'gauge' },
  { href: '/pilot/ohworks/samples', label: 'Samples', icon: 'flask' },
  { href: '/pilot/ohworks/results', label: 'Result review', icon: 'activity' },
  { href: '/pilot/ohworks/reports', label: 'Reports', icon: 'file' },
  { href: '/pilot/ohworks/personnel', label: 'Personnel', icon: 'users' },
  { href: '/pilot/ohworks/audit', label: 'Audit', icon: 'clipboard' },
] as const;

export default async function OHWorksLayout({ children }: { children: React.ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#f3f6f7] text-slate-900">
      <header className="border-b border-slate-700 bg-[#102b36] text-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-5 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-teal-300/10 p-2 ring-1 ring-teal-200/20"><Activity className="h-5 w-5 text-teal-200" /></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-200">LIMS BOX</p><p className="text-lg font-semibold">OHWorks Laboratory</p></div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block"><p className="text-sm font-medium">{principal.displayName}</p><p className="text-xs text-slate-300">{roleLabel(principal.role)}</p></div>
            <TestEnvironmentBadge />
            <form action="/pilot/ohworks/api/logout" method="post"><button aria-label="Sign out" className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white" type="submit"><LogOut className="h-4 w-4" /></button></form>
          </div>
        </div>
      </header>
      <nav className="border-b border-slate-200 bg-white shadow-sm"><div className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-4">{nav.map((item) => <PilotNavLink key={item.href} {...item} />)}</div></nav>
      <main className="mx-auto max-w-[1500px] px-5 py-7">{children}</main>
      <footer className="mt-10 border-t border-slate-200 bg-white"><div className="mx-auto max-w-[1500px] px-5 py-4 text-xs text-slate-500">All records in this test tenant are fictional and isolated from customer and production systems.</div></footer>
    </div>
  );
}
