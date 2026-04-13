import Link from 'next/link';
import { FlaskConical, Shield, FileCheck, Lock, Eye, UserCheck, Database, ArrowRight, CheckCircle2 } from 'lucide-react';
import { WaitlistFooter } from '@/components/WaitlistFooter';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Compliance — LIMS BOX | ISO 17025 & 21 CFR Part 11 Readiness',
  description: 'LIMS BOX is designed for ISO 17025 accreditation and 21 CFR Part 11 data integrity. Audit trails, electronic signatures, chain of custody, and QC enforcement built into every workflow.',
  keywords: ['ISO 17025 LIMS', '21 CFR Part 11 LIMS', 'LIMS compliance', 'lab accreditation software', 'data integrity LIMS', 'audit trail LIMS', 'electronic signatures laboratory'],
  alternates: { canonical: '/compliance' },
  openGraph: {
    title: 'Compliance — ISO 17025 & 21 CFR Part 11 | LIMS BOX',
    description: 'Audit trails, electronic signatures, chain of custody, and QC enforcement built into every LIMS BOX workflow.',
    url: 'https://lims.bot/compliance',
  },
};

const iso17025Features = [
  {
    icon: Eye,
    title: 'Complete Sample Traceability',
    description: 'Every result links to the analyst, instrument, calibration status, QC batch, and chain of custody record. Assessors can trace any result back to its origin in seconds.',
  },
  {
    icon: UserCheck,
    title: 'Analyst Competency Tracking',
    description: 'Training records, method qualifications, and competency demonstrations are tracked per analyst. The system prevents unqualified analysts from reporting results on methods they haven\'t been trained on.',
  },
  {
    icon: Shield,
    title: 'QC Enforcement',
    description: 'Method blanks, LCS, LCS duplicates, matrix spikes, and duplicate analyses are enforced at the batch level. Out-of-spec QC results block reporting until the failure is investigated and documented.',
  },
  {
    icon: FileCheck,
    title: 'Document Control',
    description: 'SOPs, method references, and work instructions are version-controlled within the system. Analysts always work from the current approved version.',
  },
  {
    icon: Database,
    title: 'Equipment Management',
    description: 'Instrument qualification (IQ/OQ/PQ), calibration schedules, and maintenance logs. Automated alerts when calibration is due or when an instrument is out of service.',
  },
];

const cfr11Features = [
  {
    icon: Lock,
    title: 'Immutable Audit Trails',
    description: 'Every action — data entry, edits, approvals, deletions — is logged with user ID, timestamp, original value, new value, and reason for change. Audit logs cannot be edited or deleted retroactively.',
  },
  {
    icon: UserCheck,
    title: 'Electronic Signatures',
    description: 'Digital signatures satisfy 21 CFR Part 11 requirements for electronic records. Password-authenticated, legally binding, and permanently tied to the signed data.',
  },
  {
    icon: Shield,
    title: 'Access Controls',
    description: 'Role-based permissions ensure analysts, reviewers, and administrators can only access functions appropriate to their role. Failed login attempts are logged and can trigger account lockout.',
  },
  {
    icon: Database,
    title: 'Data Integrity (ALCOA+)',
    description: 'All records are Attributable, Legible, Contemporaneous, Original, and Accurate. The system enforces ALCOA+ principles by design — not as an afterthought.',
  },
  {
    icon: FileCheck,
    title: 'System Validation Support',
    description: 'LIMS BOX provides validation documentation templates, including IQ/OQ/PQ protocols, test scripts, and traceability matrices to support your validation effort.',
  },
];

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl p-6">
      <Icon className="w-5 h-5 text-lab-teal mb-3" />
      <h3 className="font-semibold text-slate-900 dark:text-white mb-2 text-sm">{title}</h3>
      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

export default function CompliancePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">
      <header className="bg-white/80 dark:bg-black/80 backdrop-blur-sm border-b border-black/5 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-lab-teal" />
              <span className="text-xl font-bold text-slate-900 dark:text-white">LIMS BOX</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <Link href="/demo" className="hover:text-lab-teal transition-colors">Demo</Link>
              <Link href="/pricing" className="hover:text-lab-teal transition-colors">Pricing</Link>
              <Link href="/blog" className="hover:text-lab-teal transition-colors">Blog</Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="relative h-1 w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-lab-blue via-lab-teal via-lab-green to-lab-blue animate-gradient" />
      </div>

      {/* Hero */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 text-lab-teal mb-4">
            <Shield className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Compliance</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
            Compliance by design, not by checklist
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            LIMS BOX embeds ISO 17025 and 21 CFR Part 11 requirements into every workflow.
            Your lab doesn&apos;t prepare for audits &mdash; the system is always audit-ready.
          </p>
        </div>
      </section>

      {/* ISO 17025 */}
      <section className="px-4 pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">ISO 17025 Readiness</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
              The international standard for testing and calibration laboratories. Required for accreditation
              by A2LA, ANAB, TNI/NELAC, and state certification programs.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {iso17025Features.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* 21 CFR Part 11 */}
      <section className="px-4 pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">21 CFR Part 11 Compatibility</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
              FDA regulations for electronic records and electronic signatures. Required for
              pharmaceutical QC, clinical, and drug testing laboratories.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cfr11Features.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* Key Differentiator */}
      <section className="px-4 pb-16">
        <div className="max-w-3xl mx-auto bg-lab-teal/5 dark:bg-lab-teal/10 border border-lab-teal/20 rounded-2xl p-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
            What &ldquo;compliance-ready&rdquo; actually means
          </h2>
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
            <div className="flex gap-3">
              <CheckCircle2 className="w-5 h-5 text-lab-teal mt-0.5 shrink-0" />
              <span>LIMS BOX does <strong>not</strong> guarantee you will pass your next assessment. No software can.</span>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="w-5 h-5 text-lab-teal mt-0.5 shrink-0" />
              <span>What it does: provides the <strong>technical controls</strong> that ISO 17025 and 21 CFR Part 11 require &mdash; audit trails, access controls, traceability, electronic signatures, data integrity enforcement.</span>
            </div>
            <div className="flex gap-3">
              <CheckCircle2 className="w-5 h-5 text-lab-teal mt-0.5 shrink-0" />
              <span>Your lab still needs documented procedures, trained staff, and quality management. LIMS BOX handles the <strong>software infrastructure</strong> so your QA team can focus on the management system.</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-16">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Ready for your next assessment?
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
            See how LIMS BOX handles audit trails, QC enforcement, and data integrity in a live demo.
          </p>
          <Link
            href="/webinar"
            className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Schedule a Demo
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <WaitlistFooter />
    </div>
  );
}
