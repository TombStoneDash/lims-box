import Link from 'next/link';
import { ClipboardCheck, ArrowRight, FileText, BadgeCheck, History } from 'lucide-react';
import { WaitlistFooter } from '@/components/WaitlistFooter';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CLIA Workflow Overview — LIMS BOX',
  description:
    'Learn how LIMS BOX supports CLIA-related personnel documentation workflows and explore the Personnel Pack capability available today.',
  keywords: [
    'CLIA tracker',
    'CLIA personnel competency',
    'clinical lab personnel documentation',
  ],
  alternates: { canonical: '/clia' },
  openGraph: {
    title: 'CLIA Workflow Overview | LIMS BOX',
    description:
      'An overview of CLIA-related personnel documentation and the Personnel Pack capability available today.',
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
            <BadgeCheck className="w-3 h-3 text-lab-teal" /> Personnel Pack is available now
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            CLIA-related personnel documentation, without the spreadsheet sprawl.
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-10 max-w-2xl mx-auto">
            This page is the plain-language overview. The existing Personnel Pack capability helps
            clinical labs organize competency assessments, training records, credentials, and
            procedure authorizations with a documented history.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/clia-tracker"
              className="inline-flex items-center justify-center gap-2 bg-lab-teal text-white px-6 py-3 rounded-lg font-medium hover:bg-lab-teal/90 transition-colors"
            >
              Explore Personnel Pack <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center justify-center gap-2 border border-slate-300 dark:border-white/15 px-6 py-3 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              See the demo
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 px-4 border-t border-slate-100 dark:border-white/10">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            What exists today
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: ClipboardCheck,
                title: 'Competency assessments',
                body: 'Record initial and recurring competency assessments with dates, reviewers, and sign-off details.',
              },
              {
                icon: FileText,
                title: 'Training and credentials',
                body: 'Keep training events, licenses, certifications, and expiration dates with each personnel record.',
              },
              {
                icon: BadgeCheck,
                title: 'Procedure authorizations',
                body: 'Document which personnel are authorized for each procedure and preserve the associated review record.',
              },
              {
                icon: History,
                title: 'Documented history',
                body: 'Keep timestamped changes together so reviewers can trace who recorded an update and when.',
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
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Overview here. Working capability there.</h2>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-8">
            This overview explains the personnel-documentation problem. The Personnel Pack page
            shows the tracker workflow that is available today. LIMS BOX supports recordkeeping;
            each lab remains responsible for interpreting requirements and reviewing its records.
          </p>
          <Link
            href="/clia-tracker"
            className="inline-flex items-center gap-2 bg-lab-teal text-white px-6 py-3 rounded-lg font-medium hover:bg-lab-teal/90 transition-colors"
          >
            View the Personnel Pack tracker <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <WaitlistFooter />
    </main>
  );
}
