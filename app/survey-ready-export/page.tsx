import Link from 'next/link';
import type { Metadata } from 'next';
import {
  FlaskConical,
  FileText,
  BadgeCheck,
  Shield,
  ArrowRight,
  CheckCircle2,
  Download,
  ClipboardCheck,
  Users,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Survey-Ready Export — One-Click Compliance Packet | LIMS BOX',
  description:
    'Generate a complete CLIA and ISO 15189 personnel compliance packet in one click. Hand the inspector a folder before they ask for one.',
  alternates: { canonical: '/survey-ready-export' },
  openGraph: {
    title: 'Survey-Ready Export — One-Click Compliance Packet | LIMS BOX',
    description:
      'Competency assessments, training history, certifications, and authorizations — formatted for CLIA and ISO 15189 survey review, generated in seconds.',
    url: 'https://lims.bot/survey-ready-export',
  },
};

const included = [
  {
    icon: Users,
    title: 'Personnel records',
    description: 'Roles, qualifications, hire dates, and credential status for every lab member.',
  },
  {
    icon: ClipboardCheck,
    title: 'Competency assessments',
    description:
      'Initial 6-month and annual evaluations with supervisor sign-off and timestamps.',
  },
  {
    icon: BadgeCheck,
    title: 'Certifications',
    description: 'License numbers, expiry dates, and issuing bodies — current at time of export.',
  },
  {
    icon: FileText,
    title: 'Training history',
    description:
      'Every training event — date, trainer, topic, outcome — in the format ISO 15189 clause 6.2.2 requires.',
  },
];

export default function SurveyReadyExportPage() {
  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      {/* Header */}
      <header className="bg-black/40 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-[#2E8B57]" />
              <span className="text-xl font-bold">LIMS BOX</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-400">
              <Link href="/pricing" className="hover:text-white transition-colors">
                Pricing
              </Link>
              <Link href="/demo" className="hover:text-white transition-colors">
                Demo
              </Link>
              <Link href="/compare" className="hover:text-white transition-colors">
                Compare
              </Link>
              <Link href="/early-adopter" className="hover:text-white transition-colors">
                Early Adopter
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-12 md:py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#2E8B57]/20 text-[#2E8B57] text-sm font-medium px-3 py-1 rounded-full mb-6 border border-[#2E8B57]/30">
            <Download className="w-4 h-4" /> Survey-Ready Export
          </div>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-5">
            Hand the Inspector a Folder<br className="hidden md:block" />
            Before They Ask for One
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-8">
            LIMS BOX generates a complete personnel compliance packet — competency assessments,
            training history, certifications, and authorizations — formatted for CLIA and ISO 15189
            survey review. One click. Ready in seconds.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/demo"
              className="inline-flex items-center justify-center gap-2 bg-[#2E8B57] hover:bg-[#2E8B57]/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              See a live demo
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold px-6 py-3 rounded-lg border border-white/10 transition-colors"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>

      {/* What's in the packet */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-4">
              What&apos;s in the packet
            </h2>
            <p className="text-slate-300 max-w-2xl mx-auto">
              Everything both CLIA and ISO 15189 inspectors ask for — pulled from live data,
              formatted for review, exported as a PDF you can hand over or attach to your files.
            </p>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {included.map((item) => (
              <li
                key={item.title}
                className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-5"
              >
                <div className="w-9 h-9 rounded-lg bg-[#2E8B57]/15 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-4 h-4 text-[#2E8B57]" />
                </div>
                <div>
                  <p className="font-semibold mb-1">{item.title}</p>
                  <p className="text-sm text-slate-400 leading-relaxed">{item.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Regulatory coverage */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto bg-white/5 border border-white/10 rounded-2xl p-6 md:p-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#2E8B57] uppercase tracking-wider mb-3">
              <Shield className="w-4 h-4" /> Regulatory coverage
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
              Formatted for both frameworks
            </h2>
            <p className="text-slate-300 max-w-2xl mx-auto">
              US labs navigating both CLIA and ISO 15189 simultaneously get one export that
              satisfies both. No reformatting. No separate documents.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-black/20 border border-white/5 rounded-xl p-5">
              <p className="font-semibold text-[#2E8B57] mb-2">CLIA §493.1407</p>
              <p className="text-sm text-slate-300 leading-relaxed">
                Personnel qualifications, competency assessment records (6-month initial + annual),
                and test performance documentation for every testing personnel member.
              </p>
            </div>
            <div className="bg-black/20 border border-white/5 rounded-xl p-5">
              <p className="font-semibold text-[#2E8B57] mb-2">ISO 15189 Clause 6.2.2</p>
              <p className="text-sm text-slate-300 leading-relaxed">
                Competency evaluations, version-controlled procedures, procedure-specific
                authorization records, and ongoing training evidence in the required format.
              </p>
            </div>
          </div>
          <p className="text-center text-sm text-slate-400 mt-6">
            Included in every LIMS BOX plan at no additional cost.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-16">
        <div className="max-w-3xl mx-auto bg-gradient-to-br from-[#2E8B57]/20 to-[#2E8B57]/5 border border-[#2E8B57]/30 rounded-2xl p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-[#2E8B57] mx-auto mb-3" />
          <h2 className="text-xl md:text-2xl font-bold mb-2">
            Stop scrambling before every survey visit
          </h2>
          <p className="text-slate-300 mb-6">
            Survey-Ready Export is included in every LIMS BOX plan. Book a demo or see
            what&apos;s in each tier.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/demo"
              className="inline-flex items-center justify-center gap-2 bg-[#2E8B57] hover:bg-[#2E8B57]/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Book a demo <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold px-6 py-3 rounded-lg border border-white/10 transition-colors"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} LIMS BOX by Tombstone Dash LLC.</p>
          <div className="flex items-center gap-6">
            <a href="mailto:info@lims.bot" className="hover:text-white transition-colors">
              info@lims.bot
            </a>
            <Link href="/" className="hover:text-white transition-colors">
              lims.bot
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
