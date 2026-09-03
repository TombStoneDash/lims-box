import {
  Activity,
  Bot,
  ClipboardCheck,
  FlaskConical,
  Gauge,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { PilotNavLink } from './_components/pilot-nav-link';
import { RoleSwitch } from './_components/role-switch';

const nav = [
  { href: '/pilot/ohworks', label: 'Overview', icon: Gauge },
  { href: '/pilot/ohworks/samples', label: 'Sample workflow', icon: FlaskConical },
  { href: '/pilot/ohworks/instrument', label: 'Instrument discovery', icon: Activity },
  { href: '/pilot/ohworks/personnel', label: 'Personnel', icon: Users },
  { href: '/pilot/ohworks/audit', label: 'Audit readiness', icon: ClipboardCheck },
  { href: '/pilot/ohworks/bot', label: 'Expert assistant', icon: Bot },
] as const;

export default function OHWorksPilotLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f7f8] text-slate-900">
      <header className="border-b border-slate-700 bg-[#12232e] text-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-teal-400/15 p-2.5 ring-1 ring-teal-300/30">
              <ShieldCheck className="h-6 w-6 text-teal-300" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-300">LIMS BOX</p>
              <p className="text-xl font-semibold">OHWorks supervised demo</p>
              <p className="mt-1 text-sm text-slate-300">Synthetic demonstration data only. Discovery simulator and local workflow proof only.</p>
            </div>
          </div>

          <div className="grid gap-2 text-right text-xs text-slate-200 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="font-semibold uppercase tracking-[0.16em] text-teal-200">Boundary</p>
              <p className="mt-1 leading-5">No deployment, no customer data, no live LIAISON XL or Orchidlive claim.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="font-semibold uppercase tracking-[0.16em] text-teal-200">Release rule</p>
              <p className="mt-1 leading-5">Release requires a distinct authorized technical-review event. Worker and employer roles cannot release.</p>
            </div>
          </div>
        </div>
      </header>

      <nav className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-4">
          {nav.map(({ href, label, icon }) => (
            <PilotNavLink key={href} href={href} label={label} icon={icon} />
          ))}
        </div>
      </nav>

      <main className="mx-auto flex max-w-[1500px] flex-col gap-6 px-5 py-8">
        <RoleSwitch />
        {children}
      </main>

      <footer className="mt-10 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-2 px-5 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Synthetic demonstration data only. No patient, employee-health, or customer records are present.</span>
          <span>LIAISON XL and Orchidlive are shown as discovery hypotheses only, not validated integrations.</span>
        </div>
      </footer>
    </div>
  );
}
