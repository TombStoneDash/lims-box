import Link from 'next/link';
import type { Metadata } from 'next';
import {
  FlaskConical,
  Users,
  ClipboardCheck,
  FileText,
  BadgeCheck,
  Shield,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'CLIA Personnel Tracker — Audit-Ready Compliance in One Place | LIMS BOX',
  description:
    'Stop managing CLIA personnel compliance in spreadsheets. LIMS BOX tracks certifications, competency assessments, training logs, and authorizations with a full audit trail — ready for the inspector on day one.',
  alternates: { canonical: '/clia-tracker' },
  openGraph: {
    title: 'CLIA Personnel Tracker — Audit-Ready Compliance in One Place | LIMS BOX',
    description:
      'Centralized CLIA §493.1407 personnel tracking with a full audit log. Know your status before the inspector does.',
    url: 'https://lims.bot/clia-tracker',
  },
};

const painPoints = [
  {
    icon: AlertTriangle,
    title: 'Version drift',
    description:
      "The copy on the manager's laptop and the copy on the shared drive disagree. By inspection day you can't say which sign-off date is real.",
  },
  {
    icon: Users,
    title: 'Tribal knowledge walks out',
    description:
      'The person who knows what "yellow" means leaves. Everything they carried in their head goes with them.',
  },
  {
    icon: Search,
    title: 'No audit trail',
    description:
      "Inspectors ask 'who changed this and when.' Spreadsheets show the current state — not the history. That's the gap that writes citations.",
  },
  {
    icon: Clock,
    title: 'Rules moved twice in 18 months',
    description:
      'CLIA personnel rules got their first major overhaul since 1992 (Dec 28, 2024), then CMS issued enforcement-discretion guidance in June 2025. A static spreadsheet can't track a moving target.',
  },
];

const features = [
  {
    icon: Users,
    title: 'Personnel Roster',
    description:
      'Centralized profiles for every lab employee — roles, qualifications, hire dates, and credential status. Red/yellow/green at a glance. One source of truth.',
  },
  {
    icon: ClipboardCheck,
    title: 'Competency Assessment Tracking',
    description:
      'Document initial (6-month) and annual competency assessments per CLIA §493.1407. Timestamped evaluations with supervisor sign-off.',
  },
  {
    icon: BadgeCheck,
    title: 'Certification & Expiry Alerts',
    description:
      'Record license numbers, expiry dates, and issuing bodies. Know renewals are coming before they lapse — not after the inspector asks.',
  },
  {
    icon: FileText,
    title: 'Full Audit Log',
    description:
      'Every change is timestamped and attributed. Answer "who changed this and when" without calling a meeting or guessing.',
  },
];

export default function CliaTrackerPage() {
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
            <BadgeCheck className="w-4 h-4" /> CLIA §493.1407 Compliance
          </div>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-5">
            The Inspector Picks One Technologist.<br className="hidden md:block" />
            Can You Find the Whole File?
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-8">
            LIMS BOX tracks every certification, competency assessment, training event, and
            procedure authorization — with a full audit trail — so you stop doing that inspection
            sprint and start answering confidently.
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

      {/* Pain points */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-4">
              Why spreadsheets fail at inspection time
            </h2>
            <p className="text-slate-300 max-w-2xl mx-auto">
              The spreadsheet works — until one of these happens. And they all happen eventually.
            </p>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {painPoints.map((p) => (
              <li
                key={p.title}
                className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-5"
              >
                <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <p.icon className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <p className="font-semibold mb-1">{p.title}</p>
                  <p className="text-sm text-slate-400 leading-relaxed">{p.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Feature grid */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-4">
              Everything the inspector asks for. Already in one place.
            </h2>
            <p className="text-slate-300 max-w-2xl mx-auto">
              LIMS BOX Personnel Pack covers CLIA §493.1407 end-to-end — from the first
              6-month competency through every annual re-evaluation.
            </p>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((f) => (
              <li
                key={f.title}
                className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-5"
              >
                <div className="w-9 h-9 rounded-lg bg-[#2E8B57]/15 flex items-center justify-center flex-shrink-0">
                  <f.icon className="w-4 h-4 text-[#2E8B57]" />
                </div>
                <div>
                  <p className="font-semibold mb-1">{f.title}</p>
                  <p className="text-sm text-slate-400 leading-relaxed">{f.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Regulatory callout */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto bg-white/5 border border-white/10 rounded-2xl p-6 md:p-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#2E8B57] uppercase tracking-wider mb-3">
              <Shield className="w-4 h-4" /> Updated for current requirements
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
              CLIA rules changed. Your tracker should too.
            </h2>
            <p className="text-slate-300 max-w-2xl mx-auto">
              The CLIA personnel regulations went through their first major overhaul since 1992 —
              effective December 28, 2024. CMS followed with enforcement-discretion guidance in June 2025.
              LIMS BOX tracks current requirements, not 1992 ones.
            </p>
          </div>
          <div className="bg-black/20 border border-white/5 rounded-xl p-5">
            <p className="font-semibold text-[#2E8B57] mb-2">CLIA §493.1407</p>
            <p className="text-sm text-slate-300 leading-relaxed">
              Personnel qualifications, competency assessment (6-month initial + annual thereafter),
              test performance records for each testing personnel — now with updated qualification
              pathways and documentation requirements effective December 2024.
            </p>
          </div>
          <p className="text-center text-sm text-slate-400 mt-6">
            Included in every LIMS BOX plan. No separate module. No extra cost.
          </p>
        </div>
      </section>

      {/* Blog link */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="bg-black/20 border border-white/10 rounded-2xl p-6 md:p-8">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#2E8B57]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <FileText className="w-4 h-4 text-[#2E8B57]" />
              </div>
              <div>
                <p className="font-semibold mb-1">Further reading</p>
                <p className="text-sm text-slate-400 leading-relaxed mb-3">
                  See how the same CLIA personnel tracker was built three different ways — spreadsheet,
                  weekend MVP, full production app — and what each version revealed about why labs
                  actually fail the personnel section of an inspection.
                </p>
                <Link
                  href="/blog/clia-tracker-three-times-with-ai"
                  className="inline-flex items-center gap-1.5 text-sm text-[#2E8B57] hover:text-[#2E8B57]/80 font-medium transition-colors"
                >
                  Read: I Built the Same CLIA Tracker Three Times With AI <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA footer */}
      <section className="px-4 pb-16">
        <div className="max-w-3xl mx-auto bg-gradient-to-br from-[#2E8B57]/20 to-[#2E8B57]/5 border border-[#2E8B57]/30 rounded-2xl p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-[#2E8B57] mx-auto mb-3" />
          <h2 className="text-xl md:text-2xl font-bold mb-2">
            Ready to pass the personnel section?
          </h2>
          <p className="text-slate-300 mb-6">
            LIMS BOX includes full CLIA personnel tracking in every plan. Book a 20-minute demo
            or see what&apos;s included in each tier.
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
