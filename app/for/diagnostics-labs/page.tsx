import Link from 'next/link';
import {
  FlaskConical, ArrowRight, Clock, FileText, Users,
  Shield, AlertTriangle, CheckCircle2, Microscope, BarChart3, Dna
} from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LIMS for Diagnostics Labs: Molecular and Microbiology Lab Software | LIMS BOX',
  description: 'LIMS for small molecular and microbiology labs. Run controls that hold results for review, specimen stability tracking, culture workflows and audit trails, designed to support workflows under CLIA and ISO 15189. Starting at $500/mo.',
  alternates: { canonical: '/for/diagnostics-labs' },
  openGraph: {
    title: 'LIMS for Diagnostics Labs Where Every Control Counts',
    description: 'Run controls, specimen stability and culture workflows for small molecular and microbiology labs.',
    url: 'https://lims.bot/for/diagnostics-labs',
  },
  keywords: ['diagnostics LIMS', 'molecular lab software', 'PCR lab LIMS', 'microbiology LIMS', 'run control review', 'specimen stability tracking'],
};

const painPoints = [
  {
    icon: AlertTriangle,
    title: 'Contaminated runs',
    description: 'When a negative control amplifies, every result on that run is in question. Catching it depends on someone checking the controls before the results leave the bench.',
  },
  {
    icon: Clock,
    title: 'Specimen age',
    description: 'Swabs in transport medium and urine for culture each have a window. Courier delays and weekend backlogs push specimens past it without anyone seeing the clock.',
  },
  {
    icon: Users,
    title: 'Qualified staff, documented',
    description: 'Molecular and culture work need trained, authorized people, and the records to prove it when the surveyor asks.',
  },
];

const features = [
  {
    icon: Dna,
    title: 'Run controls that hold results',
    description: 'Positive and negative controls recorded per run. A control that reads wrong holds the run for review instead of letting results through.',
  },
  {
    icon: Clock,
    title: 'Stability tracking from collection',
    description: 'Collection time is captured at login, and specimens tested past their window are flagged instead of silently reported.',
  },
  {
    icon: BarChart3,
    title: 'Culture and molecular workflows',
    description: 'Qualitative results, colony counts and repeat testing tracked per specimen, with the original and the repeat both kept.',
  },
  {
    icon: Users,
    title: 'Personnel Pack included',
    description: 'Competency, training and authorizations per person and test system, documented for CLIA 493.1407 and ISO 15189 clause 6.2.2.',
  },
  {
    icon: FileText,
    title: 'Survey-ready exports',
    description: 'One consolidated PDF or a ZIP bundle of personnel records, ready when a surveyor asks. Every export is stamped for human review.',
  },
  {
    icon: Shield,
    title: 'An audit trail on every record',
    description: 'Who changed what, and when, on specimens, runs and results. A person verifies every result; the software never releases one on its own.',
  },
];

export default function DiagnosticsLabsPage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://lims.bot' },
      { '@type': 'ListItem', position: 2, name: 'Diagnostics Labs', item: 'https://lims.bot/for/diagnostics-labs' },
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
            <Microscope className="w-4 h-4" /> For Molecular and Microbiology Labs
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6 tracking-tight leading-tight">
            LIMS for Diagnostics Labs Where Every Control Counts
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-2xl mx-auto">
            A positive negative control can mean a whole run is suspect. A urine culture plated a day late can mean a wrong answer. Your software should catch both before anyone reads a report.
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
            Molecular and microbiology labs live and die by their controls and their specimen handling.
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
            Built for diagnostics labs
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-center mb-12 max-w-2xl mx-auto">
            Here is how LIMS BOX handles each of these. Ask for a walkthrough on made-up data.
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
            <span>Human review before release</span>
            <span className="text-slate-300">|</span>
            <span>Synthetic demo data</span>
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
          <p className="text-sm text-slate-500 mt-4">Starting at $500/mo. See <Link href="/pricing" className="text-lab-teal hover:underline">pricing</Link> for details.</p>
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
