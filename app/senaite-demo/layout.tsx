import Link from 'next/link';
import { FlaskConical, LayoutDashboard, TestTubes, Activity, Wrench, GraduationCap } from 'lucide-react';

const navItems = [
  { href: '/demo', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/demo/samples/SA-2026-0847', label: 'Sample Detail', icon: TestTubes },
  { href: '/demo/qc', label: 'QC Charts', icon: Activity },
  { href: '/demo/equipment', label: 'Equipment', icon: Wrench },
  { href: '/demo/training', label: 'Training', icon: GraduationCap },
];

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* SENAITE-style top bar */}
      <header className="bg-[#2c3e50] text-white">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical className="w-6 h-6 text-[#1abc9c]" />
            <span className="text-lg font-bold tracking-wide">SENAITE LIMS</span>
            <span className="text-xs bg-[#1abc9c] text-white px-2 py-0.5 rounded ml-2">DEMO</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-300">
            <span>Sarah Chen (Lab Director)</span>
            <span className="text-xs opacity-50">|</span>
            <span className="text-xs opacity-70">April 13, 2026</span>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-[#34495e] border-b border-[#2c3e50]">
        <div className="max-w-[1400px] mx-auto px-4 flex gap-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-[#2c3e50] transition-colors"
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-8">
        <div className="max-w-[1400px] mx-auto px-4 py-3 text-xs text-slate-400 flex justify-between">
          <span>SENAITE LIMS v2.5.0 — Mockup for LIMS BOX Demo</span>
          <span>Data is simulated for &quot;Audit Tomorrow&quot; production</span>
        </div>
      </footer>
    </div>
  );
}
