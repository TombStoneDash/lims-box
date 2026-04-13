import Link from 'next/link';
import {
  FlaskConical, ArrowRight, Shield, FileText, BarChart3,
  CheckCircle2, AlertTriangle, Leaf, Scale, ClipboardList
} from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LIMS for Cannabis Testing Labs — Compliance-Ready Lab Software | LIMS BOX',
  description: 'Compliance-ready LIMS for cannabis testing labs. Potency and terpene tracking, COA generation, state-by-state regulatory support. Starting at $500/mo.',
  alternates: { canonical: '/for/cannabis-labs' },
  openGraph: {
    title: 'Compliance-Ready LIMS for Cannabis Testing Labs',
    description: 'Potency tracking, terpene profiles, COA generation, and state regulatory compliance. Built for cannabis labs under 50 people.',
    url: 'https://lims.bot/for/cannabis-labs',
  },
  keywords: ['cannabis LIMS', 'cannabis testing software', 'potency tracking LIMS', 'COA generation', 'cannabis lab compliance', 'terpene tracking'],
};

const painPoints = [
  {
    icon: Scale,
    title: 'State-by-state regulations',
    description: 'Every state has different testing requirements, reporting formats, and compliance rules. What passes in Colorado fails in California. Your LIMS needs to know the difference.',
  },
  {
    icon: BarChart3,
    title: 'Potency & terpene tracking',
    description: 'THC, CBD, CBN, CBG — plus 30+ terpene compounds. Each with different units, limits, and reporting requirements. Manual tracking means manual errors.',
  },
  {
    icon: FileText,
    title: 'Certificate of Analysis generation',
    description: 'Clients need COAs fast. Regulators need them accurate. Generating them manually from spreadsheets means slow turnarounds and transcription risk.',
  },
];

const features = [
  {
    icon: Scale,
    title: 'Multi-state compliance engine',
    description: 'Pre-configured regulatory templates for every legal cannabis state. Action limits, reporting formats, and required tests updated as regulations change.',
  },
  {
    icon: BarChart3,
    title: 'Full cannabinoid & terpene panels',
    description: 'Track potency (THC, THCA, CBD, CBN, CBG, CBC, delta-8), terpene profiles, and total active cannabinoids. Automatic dry-weight calculations.',
  },
  {
    icon: FileText,
    title: 'One-click COA generation',
    description: 'Professional Certificates of Analysis generated automatically from your data. Client branding, QR verification codes, and batch-level detail included.',
  },
  {
    icon: Shield,
    title: 'Contaminant screening workflows',
    description: 'Pesticides, heavy metals, microbials, mycotoxins, and residual solvents — all with state-specific action limits and pass/fail determination built in.',
  },
  {
    icon: ClipboardList,
    title: 'Seed-to-sale integration',
    description: 'Connect to Metrc, BioTrack, and state track-and-trace systems. Sample intake pulls license and batch data automatically.',
  },
  {
    icon: AlertTriangle,
    title: 'Automatic hold & recall flags',
    description: 'When a contaminant screen fails, LIMS BOX flags the batch, locks the COA, and alerts the lab director. No failed result goes out the door unreviewed.',
  },
];

export default function CannabisLabsPage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://lims.bot' },
      { '@type': 'ListItem', position: 2, name: 'Cannabis Labs', item: 'https://lims.bot/for/cannabis-labs' },
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
          <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm font-medium px-3 py-1 rounded-full mb-6">
            <Leaf className="w-4 h-4" /> For Cannabis Testing Labs
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6 tracking-tight leading-tight">
            Compliance-Ready LIMS for Cannabis Testing Labs
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-2xl mx-auto">
            Your state regulator doesn't care about your spreadsheet. They care about traceable data, accurate COAs, and compliant workflows. LIMS BOX delivers all three.
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
            Cannabis testing has unique challenges
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-center mb-12 max-w-2xl mx-auto">
            The regulatory landscape changes fast. Your lab software needs to keep pace.
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
            Built for cannabis lab compliance
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-center mb-12 max-w-2xl mx-auto">
            From potency panels to pesticide screening — every workflow designed for how cannabis labs actually operate.
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

      {/* Compliance badges */}
      <section className="py-12 px-4 bg-lab-teal/5 dark:bg-lab-teal/10">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-lab-teal" />
            <span className="text-sm font-medium text-lab-teal">Regulatory compliance built in</span>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-600 dark:text-slate-300">
            <span>ISO 17025 Ready</span>
            <span className="text-slate-300">|</span>
            <span>Metrc Integration</span>
            <span className="text-slate-300">|</span>
            <span>BioTrack Compatible</span>
            <span className="text-slate-300">|</span>
            <span>State-Specific Templates</span>
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
            No implementation fee. No long-term contract. Set up in days. If it doesn't fit your lab, cancel anytime.
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
