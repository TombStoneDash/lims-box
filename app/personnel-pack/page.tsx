import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { EmailGateForm } from './EmailGateForm';
import {
  FlaskConical,
  Users,
  ClipboardCheck,
  FileText,
  BadgeCheck,
  Shield,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  UserCheck,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Personnel Pack — CLIA + ISO 15189 Competency Documentation | LIMS BOX',
  description:
    'Personnel Pack v1.5 documents personnel competency for CLIA §493.1407 and ISO 15189 clause 6.2.2. Personnel records, competency tracking, training logs, certifications, and authorizations — included in LIMS BOX at no extra cost.',
  alternates: { canonical: '/personnel-pack' },
  openGraph: {
    title: 'Personnel Pack — CLIA + ISO 15189 Competency Documentation | LIMS BOX',
    description:
      'Dual-framework personnel documentation for US labs navigating CLIA and ISO 15189 simultaneously. Included in LIMS BOX at no extra cost.',
    url: 'https://lims.bot/personnel-pack',
  },
};

const features = [
  {
    icon: Users,
    title: 'Personnel Records',
    description:
      'Centralized profiles for every lab personnel member — roles, qualifications, hire dates, and credential status in one audit-ready record.',
  },
  {
    icon: ClipboardCheck,
    title: 'Competency Tracking',
    description:
      'Document initial and ongoing competency assessments per CLIA §493.1407. Timestamped evaluations with supervisor sign-off and version-controlled procedures.',
  },
  {
    icon: GraduationCap,
    title: 'Training Logs',
    description:
      'Track every training event — date, trainer, topic, and outcome. Generates the training history ISO 15189 clause 6.2.2 requires for each personnel record.',
  },
  {
    icon: BadgeCheck,
    title: 'Certifications',
    description:
      'Record license numbers, expiry dates, and issuing bodies. Stay ahead of renewals so certifications never lapse before a survey visit.',
  },
  {
    icon: UserCheck,
    title: 'Procedure Authorizations',
    description:
      'Procedure-specific sign-off records showing which personnel are authorized to perform each test — the documentation element both CLIA and ISO 15189 require.',
  },
];

const regulatory = [
  {
    framework: 'CLIA §493.1407',
    requirement:
      'Personnel qualifications, competency assessment (6-month initial + annual thereafter), test performance records for each testing personnel.',
  },
  {
    framework: 'ISO 15189 Clause 6.2.2',
    requirement:
      'Documented competency evaluations, version-controlled procedures, procedure-specific authorization records, and ongoing training evidence.',
  },
];

function BuiltByExpert() {
  return (
    <section className="px-4 pb-8">
      <div className="max-w-4xl mx-auto border-l-4 border-[#2E8B57]/40 pl-5 py-1">
        <p className="text-sm text-slate-400 leading-relaxed">
          <span className="font-semibold text-slate-200">Built by Hudson Taylor</span> —
          MS Biochemistry (UCSD&nbsp;/&nbsp;Salk Institute), Certified Water Specialist
          (California), 15+ years of LIMS development including senior LIMS architect at
          the State of Alaska Department of Health public health lab (5M+ test results/year,
          CLIA + ISO&nbsp;15189 environment). Personnel Pack was built because these exact
          forms didn&apos;t exist in a survey-ready format for labs without a compliance
          coordinator.{' '}
          <a href="/about" className="underline text-slate-300 hover:text-white transition-colors">
            About the builder →
          </a>
        </p>
      </div>
    </section>
  );
}

export default function PersonnelPackPage() {
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
            <BadgeCheck className="w-4 h-4" /> Personnel Pack v1.5
          </div>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-5">
            CLIA + ISO&nbsp;15189 Competency Documentation in One Place
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-8">
            Personnel Pack documents personnel competency for both CLIA §493.1407 and ISO 15189
            clause 6.2.2 — the two frameworks US labs are increasingly required to satisfy
            simultaneously. No additional cost. Included in LIMS BOX.
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

      {/* Email-gated PDF lead capture — primary low-friction CTA */}
      <EmailGateForm />

      {/* Builder credentials trust block */}
      <BuiltByExpert />

      {/* Product screenshots — seeded fictional demo only */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-xs font-semibold text-[#2E8B57] uppercase tracking-wider mb-2">
              Inside the admin
            </p>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
              Built for survey day.
            </h2>
            <p className="text-slate-300 max-w-xl mx-auto text-sm">
              Personnel list, competency status tracking, and a survey-ready export — shown with
              fictional demonstration data.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl overflow-hidden border border-white/10 bg-white/5">
              <Image
                src="/screenshots/admin-personnel-pack.png"
                alt="Personnel Pack admin with fictional personnel and competency status badges"
                width={800}
                height={500}
                className="w-full h-auto"
              />
              <div className="p-3 border-t border-white/5">
                <p className="text-xs font-semibold text-slate-200">Personnel list</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Active personnel, competency status, and credentials at a glance.
                </p>
              </div>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/10 bg-white/5">
              <Image
                src="/screenshots/admin-survey-ready.png"
                alt="Survey-Ready Export dashboard with a one-click ZIP bundle download"
                width={800}
                height={500}
                className="w-full h-auto"
              />
              <div className="p-3 border-t border-white/5">
                <p className="text-xs font-semibold text-slate-200">Survey-Ready Export</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  One ZIP with an index and a detail PDF for each person.
                </p>
              </div>
            </div>
            <div className="md:col-span-2 rounded-xl overflow-hidden border border-white/10 bg-white/5">
              <Image
                src="/screenshots/admin-personnel-detail.png"
                alt="Fictional personnel detail showing competency, training, authorizations, and sign-offs"
                width={1200}
                height={600}
                className="w-full h-auto"
              />
              <div className="p-3 border-t border-white/5">
                <p className="text-xs font-semibold text-slate-200">Personnel detail</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Competency evaluations, training, procedure authorizations, and director sign-offs.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-4">
              Five modules. One compliance story.
            </h2>
            <p className="text-slate-300 max-w-2xl mx-auto">
              Personnel Pack covers every documentation layer both CLIA and ISO 15189 require —
              from initial hire through annual re-evaluation.
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

      {/* Regulatory mapping */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto bg-white/5 border border-white/10 rounded-2xl p-6 md:p-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#2E8B57] uppercase tracking-wider mb-3">
              <Shield className="w-4 h-4" /> Regulatory coverage
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
              Both frameworks. One system.
            </h2>
            <p className="text-slate-300 max-w-2xl mx-auto">
              With COLA&apos;s 2026 authorization to evaluate labs against ISO 15189, dual-framework
              documentation is no longer optional. Personnel Pack v1.5 closes the gap with the three
              documentation elements ISO 15189 requires beyond CLIA.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {regulatory.map((r) => (
              <div key={r.framework} className="bg-black/20 border border-white/5 rounded-xl p-5">
                <p className="font-semibold text-[#2E8B57] mb-2">{r.framework}</p>
                <p className="text-sm text-slate-300 leading-relaxed">{r.requirement}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-slate-400 mt-6">
            No additional cost. No new module to buy. Personnel Pack already covered 80% of the
            overlap. Version 1.5 closes the remaining 20%.
          </p>
        </div>
      </section>

      {/* What's included callout */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="bg-black/20 border border-white/10 rounded-2xl p-6 md:p-8">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-[#2E8B57]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <FileText className="w-4 h-4 text-[#2E8B57]" />
              </div>
              <div>
                <p className="font-semibold mb-1">Survey-ready PDF export</p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Generate a complete personnel competency packet — assessments, training history,
                  certifications, and authorizations — formatted for CLIA and ISO 15189 survey review.
                  Hand the inspector a folder before they ask for one.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#2E8B57]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <ClipboardCheck className="w-4 h-4 text-[#2E8B57]" />
              </div>
              <div>
                <p className="font-semibold mb-1">Internal audit log</p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Every competency review event is timestamped and attributed. The internal audit log
                  gives you a defensible chain of custody for personnel documentation — exactly what
                  ISO 15189 clause 6.2 asks for.
                </p>
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
            Ready to close your documentation gap?
          </h2>
          <p className="text-slate-300 mb-6">
            Personnel Pack is included in every LIMS BOX plan. Book a demo or see what&apos;s
            included in each tier.
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
