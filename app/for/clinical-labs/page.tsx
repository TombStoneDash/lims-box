import Link from 'next/link';
import {
  FlaskConical, ArrowRight, Clock, FileText, Users, GraduationCap,
  Shield, AlertTriangle, CheckCircle2, BarChart3, Activity
} from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Personnel and QC Documentation for Clinical Labs | LIMS BOX',
  description: 'Personnel competency records, training, authorizations and survey-ready exports for small clinical labs, designed to support workflows under CLIA and ISO 15189. A documentation layer next to your LIS, not a LIS replacement.',
  alternates: { canonical: '/for/clinical-labs' },
  openGraph: {
    title: 'Personnel and QC Documentation for Small Clinical Labs',
    description: 'Competency records, training, authorizations and survey-ready exports, next to your LIS.',
    url: 'https://lims.bot/for/clinical-labs',
  },
  keywords: ['clinical lab documentation', 'personnel competency records', 'CLIA personnel records', 'ISO 15189 competency', 'survey readiness', 'clinical lab QC review'],
};

const painPoints = [
  {
    icon: Users,
    title: 'Competency paperwork',
    description: 'Records per person and per test system, dated and signed. Keeping them current by hand is a job on its own, and the gaps show up during the survey, not before.',
  },
  {
    icon: AlertTriangle,
    title: 'Records in too many places',
    description: 'Training in one binder, sign-offs in another, authorizations in a spreadsheet. Assembling the file for one person takes an afternoon.',
  },
  {
    icon: Clock,
    title: 'Survey prep at the last minute',
    description: 'A survey notice lands and the lab stops to rebuild its personnel files. The work repeats every cycle because nothing kept the files current.',
  },
];

const features = [
  {
    icon: Users,
    title: 'Personnel competency records',
    description: 'Competency records per person, with competency type, status, completion and expiry dates, documented for CLIA 493.1407 and ISO 15189 clause 6.2.2. Part of the Personnel Pack.',
  },
  {
    icon: GraduationCap,
    title: 'Training log and director sign-offs',
    description: 'Training entries and director sign-offs kept with each person, so the file a surveyor asks for is already in one place.',
  },
  {
    icon: Shield,
    title: 'Procedure authorizations',
    description: 'Which person is authorized for which procedure, recorded per person and exportable as PDF.',
  },
  {
    icon: FileText,
    title: 'Survey-ready export',
    description: 'One consolidated PDF or a ZIP bundle of personnel records. Every export is stamped for human review before it goes anywhere.',
  },
  {
    icon: BarChart3,
    title: 'QC review, in the synthetic demo',
    description: 'The demo compares each QC run with its mean and SD and flags any run at or beyond 3 SD as out of range. Demo data only.',
  },
  {
    icon: Clock,
    title: 'Calibration reminders, in the synthetic demo',
    description: 'The demo dashboard lists the next instrument calibration due, overdue or due today, from the equipment records. Demo data only.',
  },
];

// Not built yet. Listed so the page never implies these exist.
// Not exported: a Next.js page file may only export the page and its config.
const planned = [
  'Specimen stability timers from collection to testing',
  'Analyzer result import (today there is only a CSV reader for one analyzer, used in testing)',
  'LIS or EHR integration',
  'Result release rules (a person verifies every result)',
];

export default function ClinicalLabsPage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://lims.bot' },
      { '@type': 'ListItem', position: 2, name: 'Clinical Labs', item: 'https://lims.bot/for/clinical-labs' },
    ],
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      {/* Header */}
      <header className="bg-white/80 dark:bg-black/80 backdrop-blur-sm border-b border-black/5 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-lab-teal" />
              <span className="text-xl font-bold text-slate-900 dark:text-white">LIMS BOX</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <Link href="/pricing" className="hover:text-lab-teal transition-colors">Pricing</Link>
              <Link href="/demo" className="hover:text-lab-teal transition-colors">Demo</Link>
              <Link href="/field-scout" className="hover:text-lab-teal transition-colors">Field Scout preview</Link>
              <Link href="/contact" className="hover:text-lab-teal transition-colors">Contact</Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="relative h-1 w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-lab-blue via-lab-teal via-lab-green to-lab-blue animate-gradient" />
      </div>

      {/* Hero */}
      <section className="py-16 md:py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-lab-teal/10 text-lab-teal text-sm font-medium px-3 py-1 rounded-full mb-6">
            <Activity className="w-4 h-4" /> For Clinical Chemistry and Hematology Labs
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6 tracking-tight leading-tight">
            Personnel and QC Documentation for Small Clinical Labs
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-2xl mx-auto">
            LIMS BOX keeps the records a survey asks for in one place: competency, training, authorizations and sign-offs, ready to export. It sits next to your LIS. It does not replace it.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Start Your 30-Day Pilot <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 bg-white dark:bg-white/10 hover:bg-slate-50 dark:hover:bg-white/20 text-slate-900 dark:text-white font-semibold px-6 py-3 rounded-lg border border-slate-200 dark:border-white/10 transition-colors"
            >
              See the Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="py-16 px-4 bg-white/50 dark:bg-white/5">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-center mb-4">
            Sound familiar?
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-center mb-12 max-w-2xl mx-auto">
            Small clinical labs carry the same documentation obligations as big hospital labs, with a fraction of the staff.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {painPoints.map(point => (
              <div key={point.title} className="bg-white dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/10 p-6">
                <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
                  <point.icon className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{point.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{point.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-center mb-4">
            What LIMS BOX does for clinical labs today
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-center mb-12 max-w-2xl mx-auto">
            Everything below exists today. The last two are shown on synthetic demo data only.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(feature => (
              <div key={feature.title} className="bg-white dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/10 p-6">
                <div className="w-10 h-10 rounded-lg bg-lab-teal/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-5 h-5 text-lab-teal" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planned, not built yet */}
      <section className="py-12 px-4" aria-labelledby="planned-heading">
        <div className="max-w-3xl mx-auto">
          <h2 id="planned-heading" className="text-xl font-bold text-slate-900 dark:text-white mb-3">Not built yet</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">These are planned. None of them exists in LIMS BOX today.</p>
          <ul className="list-disc pl-6 space-y-1 text-sm text-slate-600 dark:text-slate-300">
            {planned.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-12 px-4 bg-lab-teal/5 dark:bg-lab-teal/10">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-lab-teal" />
            <span className="text-sm font-medium text-lab-teal">Designed to support regulated workflows</span>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-600 dark:text-slate-300">
            <span>Designed to support CLIA workflows</span>
            <span className="text-slate-300">|</span>
            <span>ISO 15189 personnel documentation</span>
            <span className="text-slate-300">|</span>
            <span>Not a LIS replacement</span>
            <span className="text-slate-300">|</span>
            <span>Human review before export</span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Start your 30-day pilot
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-8">
            No implementation fee. No contract. Set up in days, not months. If it doesn&apos;t work for your lab, cancel anytime.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-blue text-white font-semibold px-8 py-4 rounded-lg transition-colors text-lg"
          >
            Start Your 30-Day Pilot <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="text-sm text-slate-500 mt-4">The Personnel Pack is part of the Growth plan at $1,200/mo. See <Link href="/pricing" className="text-lab-teal hover:underline">pricing</Link> for what each plan includes.</p>
        </div>
      </section>

      <footer className="py-8 px-4 border-t border-black/5 dark:border-white/5">
        <div className="max-w-7xl mx-auto text-center text-sm text-slate-500 dark:text-slate-400">
          <p>&copy; {new Date().getFullYear()} LIMS BOX by Tombstone Dash LLC.</p>
        </div>
      </footer>
    </div>
  );
}
