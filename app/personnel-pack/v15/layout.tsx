import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function PersonnelPackV15Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <Link href="/personnel-pack/v15" className="text-lg font-semibold">
              Personnel Pack v1.5
            </Link>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">ISO 15189 extension</p>
          </div>
          <nav className="flex gap-4 text-sm text-slate-600">
            <Link href="/personnel-pack/v15" className="hover:text-slate-900">Dashboard</Link>
            <Link href="/personnel-pack/v15/documents" className="hover:text-slate-900">Documents</Link>
            <Link href="/personnel-pack/v15/personnel" className="hover:text-slate-900">Personnel</Link>
            <Link href="/admin" className="hover:text-slate-900">Admin v1</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
