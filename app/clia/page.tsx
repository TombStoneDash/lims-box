import Link from 'next/link';
import { FlaskConical, ClipboardCheck, ArrowRight, CheckCircle2, FileText, Bell } from 'lucide-react';
import { WaitlistFooter } from '@/components/WaitlistFooter';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CLIA Tracker — LIMS BOX | Stay Survey-Ready',
  description: 'CLIA Tracker for clinical labs: monitor certificate status, deadlines, proficiency testing, and personnel competency in one place. Built for COLA-accredited and CLIA-only labs.',
  keywords: [
    'CLIA tracker',
    'CLIA certificate management',
    'CLIA proficiency testing',
    'COLA accreditation tracking',
    'CLIA personnel competency',
    'clinical lab compliance software',
  ],
  alternates: { canonical: '/clia' },
  openGraph: {
    title: 'CLIA Tracker — Stay Survey-Ready | LIMS BOX',
    description:
      'One place to monitor your CLIA certificate, PT results, personnel competency, and survey deadlines.',
    url: 'https://lims.bot/clia',
  },
};

export const dynamic = 'force-static';

export default function CLIATrackerPage() {
  return (
    <main className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white">
      <section className="py-20 md:py-28 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300 mb-6">
            <Bell className="w-3 h-3 text-lab-teal" /> Coming with the LIMS BOX June launch
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            CLIA Tracker — built for the part nobody likes to think about.
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-10 max-w-2xl mx-auto">
            Certificate status, PT results, personnel competency, survey deadlines. One screen.
            Designed for COLA-accredited and CLIA-only clinical labs that don&apos;t have a dedicated compliance team.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/early-adopter"
              className="inline-flex items-center justify-center gap-2 bg-lab-teal text-white px-6 py-3 rounded-lg font-medium hover:bg-lab-teal/90 transition-colors"
            >
              Join the early-adopter list <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/compliance"
              className="inline-flex items-center justify-center gap-2 border border-slate-300 dark:border-white/15 px-6 py-3 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              See full compliance scope
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 px-4 border-t border-slate-100 dark:border-white/10">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            What CLIA Tracker handles
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: ClipboardCheck,
                title: 'Certificate status at a glance',
                body: 'CLIA number, certificate type (Waiver, PPM, Compliance, Accreditation), expiration date, and renewal window — surfaced before they bite.',
              },
              {
                icon: FlaskConical,
                title: 'Proficiency testing (PT)',
                body: 'Track which analytes are enrolled, when shipments are due, when results are submitted, and which results need investigation.',
              },
              {
                icon: FileText,
                title: 'Personnel competency',
                body: 'Per-employee competency assessments mapped to test systems. Six elements per §493.1235. Renewal alerts before they expire.',
              },
              {
                icon: CheckCircle2,
                title: 'Survey readiness',
                body: 'Inspection checklist mapped to current COLA criteria + CLIA condition-level requirements. Pull a packet at any time.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 dark:border-white/10 p-6 bg-white dark:bg-white/5"
              >
                <div className="w-10 h-10 rounded-lg bg-lab-teal/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-lab-teal" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 border-t border-slate-100 dark:border-white/10">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Built for the labs we actually meet</h2>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-8">
            Small clinical labs (1–25 staff). Often one person wearing the lab director, technical
            consultant, and compliance officer hats. CLIA Tracker is the tool that one person needs
            so they can stop maintaining their own spreadsheet of expiration dates.
          </p>
          <Link
            href="/early-adopter"
            className="inline-flex items-center gap-2 bg-lab-teal text-white px-6 py-3 rounded-lg font-medium hover:bg-lab-teal/90 transition-colors"
          >
            Apply for the early-adopter pilot <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <WaitlistFooter />
    </main>
  );
}
