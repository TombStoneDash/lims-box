import Link from 'next/link';
import {
  Activity,
  ClipboardCheck,
  FlaskConical,
  Gauge,
  ShieldCheck,
  Users,
} from 'lucide-react';

const nav = [
  { href: '/pilot/ohworks', label: 'Overview', icon: Gauge },
  { href: '/pilot/ohworks/samples', label: 'Sample workflow', icon: FlaskConical },
  { href: '/pilot/ohworks/instrument', label: 'Instrument interface', icon: Activity },
  { href: '/pilot/ohworks/personnel', label: 'Personnel', icon: Users },
  { href: '/pilot/ohworks/audit', label: 'Audit readiness', icon: ClipboardCheck },
];

export default function OHWorksPilotLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f7f8] text-slate-900">
      <header className="border-b border-slate-700 bg-[#12232e] text-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-teal-400/15 p-2 ring-1 ring-teal-300/30">
              <ShieldCheck className="h-6 w-6 text-teal-300" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-300">LIMS BOX</p>
              <p className="text-lg font-semibold">OHWorks controlled pilot</p>
            </div>
          </div>
          <div className="rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
            Synthetic data · Discovery only
          </div>
        </div>
      </header>

      <nav className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-4">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex shrink-0 items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-teal-500 hover:text-slate-950"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-[1500px] px-5 py-8">{children}</main>

      <footer className="mt-10 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-1 px-5 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>No patient, employee-health, or customer records are present.</span>
          <span>Prototype workflow support; not a compliance or accreditation determination.</span>
        </div>
      </footer>
    </div>
  );
}
