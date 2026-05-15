import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About LIMS BOX",
  description: "A local-first continuity layer for labs that can't afford to stop. Built by Hud Taylor.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/start" className="text-sm font-semibold">LIMS BOX</Link>
          <Link href="/start" className="text-xs text-slate-600 hover:text-slate-900">
            Back to start
          </Link>
        </div>
      </header>

      <section className="max-w-2xl mx-auto px-6 py-16 space-y-6 text-slate-800 leading-relaxed">
        <h1 className="text-2xl font-semibold text-slate-900">About</h1>

        <p>
          LIMS BOX is built by Hud Taylor. MS Biochem (UCSD / Salk). Certified Water Specialist (California). 15+ years
          of lab software, including senior LIMS development at the State of Alaska Department of Health&apos;s public
          health lab — five hospitals, ten labs, 5M+ test results a year.
        </p>

        <p>
          Built because the small clinical and environmental labs I kept meeting at COLA, ACE, and ELAP told me the same
          thing: the big LIMS vendors don&apos;t build for us. We need the boring documentation layer that should already
          exist.
        </p>

        <p>
          Not a LIMS replacement. Not compliance automation. A local-first continuity layer for labs that can&apos;t
          afford to stop.
        </p>

        <p>
          Reply to{" "}
          <a href="mailto:hudtaylor@gmail.com" className="underline text-slate-900">
            hudtaylor@gmail.com
          </a>{" "}
          if you want to use it.
        </p>

        <div className="pt-6 flex gap-3">
          <Link
            href="/clinical"
            className="rounded-md bg-teal-600 text-white px-4 py-2 text-sm font-medium hover:bg-teal-700"
          >
            Clinical lab →
          </Link>
          <Link
            href="/environmental"
            className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-800"
          >
            Environmental lab →
          </Link>
        </div>
      </section>
    </main>
  );
}
