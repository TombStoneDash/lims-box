import Link from 'next/link';
import {
  FlaskConical, ArrowRight, Clock, FileText, MapPin,
  Shield, AlertTriangle, CheckCircle2, Droplets, BarChart3
} from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LIMS for Environmental Labs — Water & Soil Testing Software | LIMS BOX',
  description: 'LIMS built for environmental testing labs. Automated EPA reporting, holding time alerts, field-to-lab sample tracking, and chain of custody management. Starting at $500/mo.',
  alternates: { canonical: '/for/environmental-labs' },
  openGraph: {
    title: 'LIMS Built for Labs That Test Water, Not Patience',
    description: 'Automated EPA reporting, holding time alerts, and field-to-lab chain of custody. Built for environmental labs under 50 people.',
    url: 'https://lims.bot/for/environmental-labs',
  },
  keywords: ['environmental LIMS', 'water testing LIMS', 'EPA reporting software', 'environmental lab software', 'holding time tracking', 'chain of custody software'],
};

const painPoints = [
  {
    icon: Clock,
    title: 'EPA reporting deadlines',
    description: 'Monthly DMR submissions, quarterly reports, annual compliance packages — each with different formats and deadlines. One missed submission triggers agency scrutiny on everything else.',
  },
  {
    icon: AlertTriangle,
    title: 'Holding time tracking',
    description: 'Nitrate is 48 hours. BOD is 48 hours. Metals is 6 months. Miss a holding time and the data is non-compliant. Spreadsheets don\'t send alerts — they just let deadlines pass silently.',
  },
  {
    icon: Shield,
    title: 'Chain of custody gaps',
    description: 'Field techs collect samples. Couriers transport them. Lab staff receive and process them. Every handoff is a potential break in the chain — and every break is an audit finding.',
  },
];

const features = [
  {
    icon: Clock,
    title: 'Automated holding time alerts',
    description: 'Holding time countdown starts automatically at sample login. Color-coded warnings at 75% and 90% of the hold limit. Dashboard alerts before any sample expires.',
  },
  {
    icon: FileText,
    title: 'One-click EPA reports',
    description: 'DMR submissions, discharge monitoring, and compliance packages generated automatically from your data. Pre-formatted for EPA and state agency requirements.',
  },
  {
    icon: MapPin,
    title: 'Field-to-lab sample tracking',
    description: 'Track samples from the collection point through transport, receipt, analysis, and reporting. GPS coordinates, field conditions, and preservation status all captured at login.',
  },
  {
    icon: Droplets,
    title: 'Environmental method library',
    description: 'EPA 200/500/600 series, SM methods, and state-specific requirements pre-loaded. Regulatory limits, preservation requirements, and holding times built into every method.',
  },
  {
    icon: Shield,
    title: 'Unbreakable chain of custody',
    description: 'Electronic signatures at every handoff. Timestamped, IP-logged, tamper-evident. The COC builds itself as the sample moves through your workflow.',
  },
  {
    icon: BarChart3,
    title: 'QA/QC that runs itself',
    description: 'Method blanks, LCS/LCSD, matrix spikes, and duplicates tracked per batch. RPDs and recoveries calculated automatically. Exceedances flagged before results go out.',
  },
];

export default function EnvironmentalLabsPage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://lims.bot' },
      { '@type': 'ListItem', position: 2, name: 'Environmental Labs', item: 'https://lims.bot/for/environmental-labs' },
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
            <Droplets className="w-4 h-4" /> For Environmental & Water Testing Labs
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6 tracking-tight leading-tight">
            LIMS Built for Labs That Test Water, Not Patience
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-2xl mx-auto">
            Your lab runs on tight turnarounds, strict regulatory deadlines, and unbroken chains of custody. Your software should keep up — not slow you down.
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
            Environmental labs face unique challenges that generic LIMS platforms and spreadsheets can't handle.
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
            Built for environmental testing
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-center mb-12 max-w-2xl mx-auto">
            Every feature in LIMS BOX was designed for the way environmental labs actually work.
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
            <span className="text-sm font-medium text-lab-teal">Purpose-built for compliance</span>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-600 dark:text-slate-300">
            <span>ISO 17025 Ready</span>
            <span className="text-slate-300">|</span>
            <span>EPA Method Library</span>
            <span className="text-slate-300">|</span>
            <span>40 CFR Part 136 Compliant</span>
            <span className="text-slate-300">|</span>
            <span>State Agency Formats</span>
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
            No implementation fee. No contract. Set up in days, not months. If it doesn't work for your lab, cancel anytime.
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
