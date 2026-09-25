import { FlaskConical } from 'lucide-react';

import { DemoNavLink } from '@/components/senaite-demo/DemoNavLink';

const navItems = [
  { href: '/senaite-demo', label: 'Dashboard', icon: 'dashboard' as const },
  { href: '/senaite-demo/samples/SA-2026-0847', label: 'Sample Detail', icon: 'sample' as const },
  { href: '/senaite-demo/qc', label: 'QC Charts', icon: 'qc' as const },
  { href: '/senaite-demo/equipment', label: 'Equipment', icon: 'equipment' as const },
  { href: '/senaite-demo/training', label: 'Training', icon: 'training' as const },
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
            <span className="text-xs bg-[#1abc9c] text-white px-2 py-0.5 rounded ml-2">SYNTHETIC · NON-PRODUCTION</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-300">
            <span>Sarah Chen (Lab Director)</span>
            <span className="text-xs opacity-50">|</span>
            <span className="text-xs opacity-70">April 13, 2026</span>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-[#34495e] border-b border-[#2c3e50]" aria-label="SENAITE demo sections">
        <div className="max-w-[1400px] mx-auto px-4 flex gap-1 overflow-x-auto">
          {navItems.map(item => (
            <DemoNavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
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
          <span>Fictional browser display only · no customer or production data</span>
        </div>
      </footer>
    </div>
  );
}
