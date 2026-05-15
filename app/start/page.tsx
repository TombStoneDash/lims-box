import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LIMS BOX — Choose your lab type",
  description:
    "Workflow documentation support and offline continuity for labs that can't afford to stop.",
};

export default function StartPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-3xl w-full text-center">
          <p className="text-sm text-slate-600 mb-2">
            Workflow documentation support and offline continuity for labs that can&apos;t afford to stop.
          </p>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-10">Which lab type are you?</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Link
              href="/clinical"
              className="group rounded-md border border-slate-300 bg-white p-8 text-left hover:border-teal-600 hover:bg-teal-50/40 transition-colors"
            >
              <div className="text-3xl mb-2">🧬</div>
              <div className="text-xl font-semibold text-slate-900">Clinical lab</div>
              <p className="mt-2 text-sm text-slate-600">
                CLIA-certified, CAP-accredited, patient-impacting labs.
              </p>
              <div className="mt-6 text-sm font-medium text-teal-700 group-hover:text-teal-800">
                Continue →
              </div>
            </Link>

            <Link
              href="/environmental"
              className="group rounded-md border border-slate-300 bg-white p-8 text-left hover:border-emerald-700 hover:bg-emerald-50/40 transition-colors"
            >
              <div className="text-3xl mb-2">🌊</div>
              <div className="text-xl font-semibold text-slate-900">Environmental lab</div>
              <p className="mt-2 text-sm text-slate-600">
                NELAP/ELAP, EPA, drinking water, wastewater, soil, food labs.
              </p>
              <div className="mt-6 text-sm font-medium text-emerald-800 group-hover:text-emerald-900">
                Continue →
              </div>
            </Link>
          </div>

          <p className="mt-10 text-xs text-slate-500">
            Made by a multidisciplinary scientist with 15+ years in lab software. Not a LIMS replacement.
          </p>
        </div>
      </div>
      <footer className="px-6 py-6 text-center">
        <Link href="/about" className="text-xs text-slate-500 hover:text-slate-900 underline">
          About LIMS BOX
        </Link>
      </footer>
    </main>
  );
}
