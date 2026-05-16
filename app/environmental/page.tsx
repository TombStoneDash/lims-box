import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LIMS BOX for environmental labs — field-to-bench continuity",
  description:
    "Local-first documentation layer for NELAP/ELAP environmental labs. Field-to-bench continuity. Audit-trail organization. Human-reviewed drafting. Not a LIMS replacement.",
};

export default function EnvironmentalLandingPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <Header />
      <section className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-xs uppercase tracking-widest text-emerald-800 font-medium mb-3">For environmental labs</p>
        <h1 className="text-3xl md:text-4xl font-semibold leading-snug">
          When your sample comes off a truck in the field, when the LIMS only works at the office, when a NELAP audit
          asks for the calibration record you printed in 2023 — LIMS BOX is the local-first documentation layer for
          environmental labs that work outside the building.
        </h1>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-16 space-y-10">
        <Block
          title="Field-to-bench continuity"
          body="Sample chain-of-custody, calibration logs, and SOP access on a tablet in the field, syncing back when the network returns. Drinking water, wastewater, soil, ambient air."
        />
        <Block
          title="Audit-trail organization"
          body="Calibration records, instrument logs, method validation files, and NELAP/ELAP documentation organized for audit prep without a weekend scramble."
        />
        <Block
          title="Human-reviewed drafting"
          body="Documentation drafts you review and approve. Not regulatory submissions. Not compliance automation."
        />
      </section>

      <section className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <blockquote className="text-lg italic text-slate-800 leading-relaxed">
            &ldquo;We had a NELAP audit last month and spent 18 hours pulling calibration records out of three different binders.&rdquo;
          </blockquote>
          <p className="mt-3 text-sm text-slate-600">— Environmental Lab Manager</p>
          <hr className="my-6 border-slate-200" />
          <p className="text-sm text-slate-700">
            <strong className="font-medium">Built by Hud Taylor.</strong> Certified Water Specialist (California) · MS Biochem UCSD/Salk · Former Lab Manager at CalEnergy Operating Corporation (geothermal, environmental compliance).
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <Link
          href="/environmental/intake"
          className="inline-flex items-center rounded-md bg-emerald-700 text-white px-6 py-3 text-sm font-medium hover:bg-emerald-800"
        >
          Tell us about your lab →
        </Link>
        <p className="mt-4 text-xs text-slate-500">
          A short form. HT reads each one personally and reaches out within 48 hours.
        </p>
      </section>
      <Footer />
    </main>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-base text-slate-700 leading-relaxed">{body}</p>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-slate-200">
      <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/start" className="text-sm font-semibold text-slate-900">LIMS BOX</Link>
        <Link href="/clinical" className="text-xs text-slate-600 hover:text-slate-900">
          Clinical lab? →
        </Link>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200">
      <div className="max-w-3xl mx-auto px-6 py-8 text-xs text-slate-500 flex flex-wrap gap-4">
        <Link href="/start" className="hover:text-slate-900">Choose lab type</Link>
        <Link href="/about" className="hover:text-slate-900">About</Link>
        <span className="ml-auto">Workflow documentation support · Human-reviewed drafting · Local-first lab records.</span>
      </div>
    </footer>
  );
}
