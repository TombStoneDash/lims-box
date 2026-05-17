import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Personnel Pack — LIMS BOX",
  description: "Workflow documentation support for CLIA personnel records.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-semibold">
              Personnel Pack
            </Link>
            <nav className="text-sm text-slate-600 flex gap-4">
              <Link href="/admin" className="hover:text-slate-900">Dashboard</Link>
              <Link href="/admin/people" className="hover:text-slate-900">People</Link>
              <Link href="/admin/survey-ready" className="hover:text-slate-900">Survey-ready bundle</Link>
            </nav>
          </div>
          <span className="text-xs text-slate-400 uppercase tracking-wide">v1 · local</span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
      <footer className="max-w-6xl mx-auto px-6 py-8 text-xs text-slate-400">
        Workflow documentation support · Human-reviewed drafting · Local-first lab records.
      </footer>
    </div>
  );
}
