import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LIMS BOX for clinical labs — local-first documentation continuity",
  description:
    "Local-first documentation layer for CLIA-certified clinical labs. Survey-readiness organization. Human-reviewed drafting. Not a LIMS replacement.",
};

export default function ClinicalLandingPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <Header />
      <section className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-xs uppercase tracking-widest text-teal-700 font-medium mb-3">For clinical labs</p>
        <h1 className="text-3xl md:text-4xl font-semibold leading-snug">
          When your LIS goes down, when your vendor portal is unreachable, when a survey lands next month and your
          personnel records live in three folders — LIMS BOX is the local-first documentation layer that fills the gaps.
        </h1>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-16 space-y-10">
        <Block
          title="Downtime continuity"
          body="Local-first SOP access, asset records, and result-capture forms that work when the network is down. Survives planned maintenance, vendor outages, ransomware events."
        />
        <Block
          title="Survey-readiness organization"
          body="Personnel records, competency matrices, director sign-offs, training logs in one place. PDF bundle export for CMS, CAP, COLA visits."
        />
        <Block
          title="Human-reviewed drafting"
          body="Workflow documentation drafts you can edit and approve. Not auto-generated submissions. Not compliance automation."
        />
      </section>

      <section className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <p className="text-lg italic text-slate-800 leading-relaxed">
            &ldquo;Downtime isn&apos;t theoretical. We just had three days last quarter.&rdquo;
          </p>
          <p className="mt-3 text-sm text-slate-600">An illustrative example of a story we hear often from clinical lab quality coordinators — not an attributed customer quote.</p>
          <hr className="my-6 border-slate-200" />
          <p className="text-sm text-slate-700">
            <strong className="font-medium">Built by Hud Taylor.</strong> MS Biochem UCSD/Salk · 15+ years in LIMS · Former Senior LIMS Developer at the State of Alaska Department of Health public health lab (5M+ test results/year).
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <Link
          href="/clinical/intake"
          className="inline-flex items-center rounded-md bg-teal-600 text-white px-6 py-3 text-sm font-medium hover:bg-teal-700"
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
        <Link href="/environmental" className="text-xs text-slate-600 hover:text-slate-900">
          Environmental lab? →
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
