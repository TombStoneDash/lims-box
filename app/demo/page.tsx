'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  FlaskConical, ArrowRight, ArrowLeft, Check, ClipboardList,
  FileText, BarChart3, Droplets, Clock, Shield, User,
  AlertTriangle, DollarSign, Calendar
} from 'lucide-react';

type Step = 'entry' | 'coc' | 'report';

const steps: { id: Step; label: string; icon: React.ElementType }[] = [
  { id: 'entry', label: 'Sample Entry', icon: ClipboardList },
  { id: 'coc', label: 'Chain of Custody', icon: Shield },
  { id: 'report', label: 'Compliance Report', icon: FileText },
];

function SampleEntryStep() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Sample Logged</h3>
        <p className="text-slate-600 dark:text-slate-300 text-sm">
          WS-2026-0384 has been registered. Holding time countdown started automatically.
        </p>
        <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 max-w-sm mx-auto">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <Clock className="w-4 h-4" />
            <span><strong>Holding time alert:</strong> Nitrate — 48 hours (expires Apr 15, 10:30 AM)</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Sample ID</label>
          <div className="px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white font-mono">
            WS-2026-0384 <span className="text-slate-400">(auto-generated)</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Sample Type</label>
          <div className="px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Droplets className="w-4 h-4 text-blue-500" /> Drinking Water
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Client</label>
          <div className="px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white">
            Mesa County Water District
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Collection Date/Time</label>
          <div className="px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white">
            April 13, 2026 — 10:30 AM
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Analysis Requested</label>
          <div className="px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white">
            Nitrate (NO₃) — EPA Method 300.0
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Collected By</label>
          <div className="px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400" /> Maria Gonzalez (Field Tech)
          </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>Auto-detected:</strong> Nitrate has a 48-hour holding time per EPA 300.0. Preservation: Cool to 4°C. Matrix: Drinking Water.
        </p>
      </div>

      <button
        onClick={() => setSubmitted(true)}
        className="w-full md:w-auto px-6 py-3 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        Log Sample <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function COCStep() {
  const [signed, setSigned] = useState(false);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden">
        <div className="bg-slate-50 dark:bg-white/5 px-4 py-3 border-b border-slate-200 dark:border-white/10">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Chain of Custody — COC-2026-0384</h3>
        </div>
        <div className="p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-white/10">
                <th className="text-left py-2 pr-4">Event</th>
                <th className="text-left py-2 pr-4">Date/Time</th>
                <th className="text-left py-2 pr-4">Person</th>
                <th className="text-left py-2">Signature</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-300">
              <tr className="border-b border-slate-50 dark:border-white/5">
                <td className="py-2.5 pr-4 font-medium">Collected</td>
                <td className="py-2.5 pr-4 font-mono text-xs">Apr 13, 2026 10:30 AM</td>
                <td className="py-2.5 pr-4">Maria Gonzalez</td>
                <td className="py-2.5"><span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Signed</span></td>
              </tr>
              <tr className="border-b border-slate-50 dark:border-white/5">
                <td className="py-2.5 pr-4 font-medium">Transported</td>
                <td className="py-2.5 pr-4 font-mono text-xs">Apr 13, 2026 11:15 AM</td>
                <td className="py-2.5 pr-4">Maria Gonzalez</td>
                <td className="py-2.5"><span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Signed</span></td>
              </tr>
              <tr className="border-b border-slate-50 dark:border-white/5">
                <td className="py-2.5 pr-4 font-medium">Received at Lab</td>
                <td className="py-2.5 pr-4 font-mono text-xs">Apr 13, 2026 12:02 PM</td>
                <td className="py-2.5 pr-4">Jake Simmons</td>
                <td className="py-2.5">
                  {signed ? (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Signed</span>
                  ) : (
                    <button
                      onClick={() => setSigned(true)}
                      className="text-xs px-2 py-0.5 bg-lab-teal text-white rounded-full hover:bg-lab-teal/90 transition-colors"
                    >
                      Click to Sign
                    </button>
                  )}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium text-slate-400">Analyzed</td>
                <td className="py-2.5 pr-4 text-slate-400 text-xs">Pending</td>
                <td className="py-2.5 pr-4 text-slate-400">—</td>
                <td className="py-2.5"><span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-white/10 text-slate-400 rounded-full">Awaiting</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {signed && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm text-green-800 dark:text-green-200">
            <Check className="w-4 h-4" />
            <span><strong>COC complete.</strong> Electronic signature captured with timestamp and IP. Full audit trail recorded.</span>
          </div>
        </div>
      )}

      <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-4">
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sample Condition at Receipt</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center gap-2 text-green-700"><Check className="w-4 h-4" /> Temperature OK (4.1°C)</div>
          <div className="flex items-center gap-2 text-green-700"><Check className="w-4 h-4" /> Container intact</div>
          <div className="flex items-center gap-2 text-green-700"><Check className="w-4 h-4" /> Properly preserved</div>
          <div className="flex items-center gap-2 text-green-700"><Check className="w-4 h-4" /> Labels match COC</div>
        </div>
      </div>
    </div>
  );
}

function ReportStep() {
  const [generated, setGenerated] = useState(false);

  return (
    <div className="space-y-6">
      {!generated ? (
        <div className="text-center py-8">
          <BarChart3 className="w-12 h-12 text-lab-teal mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Generate Compliance Report</h3>
          <p className="text-slate-600 dark:text-slate-300 text-sm mb-6 max-w-md mx-auto">
            LIMS BOX auto-populates the report with sample data, QC results, and regulatory limits. One click.
          </p>
          <button
            onClick={() => setGenerated(true)}
            className="px-6 py-3 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold rounded-lg transition-colors inline-flex items-center gap-2"
          >
            <FileText className="w-4 h-4" /> Generate Report
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden">
          {/* Report header */}
          <div className="bg-slate-800 text-white px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Analytical Report</h3>
                <p className="text-slate-300 text-xs">LIMS BOX Report #RPT-2026-0384</p>
              </div>
              <div className="text-right text-xs text-slate-300">
                <p>Generated: April 14, 2026</p>
                <p>Report Status: FINAL</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Client info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Client</p>
                <p className="font-medium text-slate-900 dark:text-white">Mesa County Water District</p>
                <p className="text-slate-600 dark:text-slate-400">123 Main St, Grand Junction, CO 81501</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Project</p>
                <p className="font-medium text-slate-900 dark:text-white">Monthly Compliance Monitoring</p>
                <p className="text-slate-600 dark:text-slate-400">Permit #CO-0042891</p>
              </div>
            </div>

            {/* Results table */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Analytical Results</h4>
              <table className="w-full text-sm border border-slate-200 dark:border-white/10">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 text-xs text-slate-500 uppercase">
                    <th className="text-left py-2 px-3">Sample ID</th>
                    <th className="text-left py-2 px-3">Analyte</th>
                    <th className="text-right py-2 px-3">Result</th>
                    <th className="text-right py-2 px-3">MCL</th>
                    <th className="text-left py-2 px-3">Method</th>
                    <th className="text-left py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 dark:text-slate-300">
                  <tr className="border-t border-slate-100 dark:border-white/5">
                    <td className="py-2 px-3 font-mono">WS-2026-0384</td>
                    <td className="py-2 px-3">Nitrate (as N)</td>
                    <td className="py-2 px-3 text-right font-mono font-medium">4.2 mg/L</td>
                    <td className="py-2 px-3 text-right font-mono text-slate-500">10 mg/L</td>
                    <td className="py-2 px-3">EPA 300.0</td>
                    <td className="py-2 px-3"><span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Below MCL</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* QC summary */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">QC Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Method Blank</p>
                  <p className="font-medium text-green-700">&lt;MDL — Pass</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                  <p className="text-xs text-slate-500">LCS Recovery</p>
                  <p className="font-medium text-green-700">97.2% — Pass</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Duplicate RPD</p>
                  <p className="font-medium text-green-700">2.1% — Pass</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Matrix Spike</p>
                  <p className="font-medium text-green-700">101.5% — Pass</p>
                </div>
              </div>
            </div>

            {/* Compliance note */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
              <strong>Compliance note:</strong> Nitrate result of 4.2 mg/L is below the EPA Maximum Contaminant Level (MCL) of 10 mg/L for drinking water. Sample was analyzed within holding time. All QC criteria met.
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-white/5 border-t border-slate-200 dark:border-white/10 px-6 py-3 text-xs text-slate-400">
            Auto-generated by LIMS BOX — This report was compiled automatically from sample, QC, and method data. Electronic signatures and full audit trail are stored in the system.
          </div>
        </div>
      )}
    </div>
  );
}

// TODO: Replace placeholder URL with actual Calendly link once created
const CALENDLY_URL =
  'https://calendly.com/tombstonedash/lims-demo?hide_gdpr_banner=1&background_color=f8fafc&text_color=0f172a&primary_color=0d9488';

function CalendlyEmbed() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://assets.calendly.com/assets/external/widget.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl overflow-hidden">
      <div
        className="calendly-inline-widget"
        data-url={CALENDLY_URL}
        style={{ minWidth: '320px', height: '700px' }}
      />
    </div>
  );
}

export default function DemoPage() {
  const [currentStep, setCurrentStep] = useState<Step>('entry');
  const stepIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://lims.bot' },
              { '@type': 'ListItem', position: 2, name: 'Demo', item: 'https://lims.bot/demo' },
            ],
          }),
        }}
      />
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
              <Link href="/blog" className="hover:text-lab-teal transition-colors">Blog</Link>
              <Link href="/contact" className="hover:text-lab-teal transition-colors">Contact</Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="relative h-1 w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-lab-blue via-lab-teal via-lab-green to-lab-blue animate-gradient" />
      </div>

      {/* Hero */}
      <section className="py-12 md:py-16 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
            Schedule a LIMS BOX Demo
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 mb-6">
            Walk through a real workflow: logging a drinking water sample for nitrate testing, tracking chain of custody, and generating a compliance report.
          </p>
          <a
            href="#schedule"
            className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            <Calendar className="w-4 h-4" /> Schedule a Demo
          </a>
        </div>
      </section>

      {/* Step navigation */}
      <section className="px-4 pb-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between bg-white dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/10 p-1">
            {steps.map((step, i) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-medium transition-colors ${
                  currentStep === step.id
                    ? 'bg-lab-teal text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <span className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0" style={{
                  borderColor: currentStep === step.id ? 'white' : undefined,
                }}>
                  {i + 1}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Step content */}
      <section className="px-4 pb-12">
        <div className="max-w-3xl mx-auto bg-white dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/10 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-6">
            {(() => {
              const StepIcon = steps[stepIndex].icon;
              return <StepIcon className="w-5 h-5 text-lab-teal" />;
            })()}
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Step {stepIndex + 1}: {steps[stepIndex].label}
            </h2>
          </div>

          {currentStep === 'entry' && <SampleEntryStep />}
          {currentStep === 'coc' && <COCStep />}
          {currentStep === 'report' && <ReportStep />}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100 dark:border-white/10">
            <button
              onClick={() => setCurrentStep(steps[Math.max(0, stepIndex - 1)].id)}
              disabled={stepIndex === 0}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Previous
            </button>
            {stepIndex < steps.length - 1 ? (
              <button
                onClick={() => setCurrentStep(steps[stepIndex + 1].id)}
                className="flex items-center gap-2 text-sm font-medium text-lab-teal hover:text-lab-blue transition-colors"
              >
                Next Step <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <Link
                href="/contact"
                className="flex items-center gap-2 px-4 py-2 bg-lab-teal hover:bg-lab-teal/90 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Start Your 30-Day Pilot <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* CMS Deficiency Stats */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Why labs fail inspections
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Top CMS deficiency categories — the problems LIMS BOX is built to prevent.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">5.0%</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Reagent handling & storage</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Expired reagents, missing lot numbers, undocumented storage temps. LIMS BOX tracks expiration dates, lot numbers, and storage conditions automatically.
              </p>
            </div>
            <div className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">4.8%</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Competency assessment</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Expired training records, missing competency documentation, untracked certifications. LIMS BOX alerts before any competency expires.
              </p>
            </div>
            <div className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span className="text-2xl font-bold text-slate-900 dark:text-white">3.9%</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Procedure documentation</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Outdated SOPs, unsigned procedures, missing revision control. LIMS BOX enforces document control with electronic signatures and version tracking.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Competitor Pricing Comparison */}
      <section className="py-12 px-4 bg-white/50 dark:bg-white/5 border-y border-black/5 dark:border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              How LIMS BOX compares
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Real pricing. Real timelines. No asterisks.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10">
                  <th className="text-left py-3 px-4 text-slate-500 font-medium"></th>
                  <th className="text-center py-3 px-4 bg-lab-teal/10 dark:bg-lab-teal/20 rounded-t-lg">
                    <span className="text-lab-teal font-bold">LIMS BOX</span>
                  </th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">LabWare</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">STARLIMS</th>
                  <th className="text-center py-3 px-4 text-slate-500 font-medium">Spreadsheets</th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-300">
                {[
                  ['Starting price', '$500/mo', '$100K+', '$150K+', 'Free'],
                  ['Implementation', 'Days', '12–18 months', '12–24 months', 'N/A'],
                  ['Users included', '3–10', 'Per-seat', 'Per-seat', 'Unlimited'],
                  ['Audit trail', 'Built-in', 'Built-in', 'Built-in', 'None'],
                  ['IT required', 'No', 'Dedicated team', 'Dedicated team', 'No'],
                  ['Contract', 'Month-to-month', '3–5 years', '3–5 years', 'N/A'],
                ].map(([label, lims, lw, star, xl]) => (
                  <tr key={label} className="border-b border-slate-100 dark:border-white/5">
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium">{label}</td>
                    <td className="py-3 px-4 text-center bg-lab-teal/5 dark:bg-lab-teal/10 font-semibold text-lab-teal">{lims}</td>
                    <td className="py-3 px-4 text-center text-slate-500">{lw}</td>
                    <td className="py-3 px-4 text-center text-slate-500">{star}</td>
                    <td className="py-3 px-4 text-center text-slate-500">{xl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2">
            <DollarSign className="w-4 h-4 text-lab-teal" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <Link href="/pricing" className="text-lab-teal hover:underline font-medium">See full pricing</Link> — no implementation fee, no long-term contract.
            </p>
          </div>
        </div>
      </section>

      {/* Value Props for Lab Directors */}
      <section className="py-12 px-4 bg-white/50 dark:bg-white/5 border-y border-black/5 dark:border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-8">
            What lab directors see in a live demo
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-lab-teal/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <FlaskConical className="w-6 h-6 text-lab-teal" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1 text-sm">Voice-Controlled SENAITE</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Log samples, record results, and query your LIMS hands-free. Built for techs wearing gloves and PPE.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-lab-teal/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Clock className="w-6 h-6 text-lab-teal" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1 text-sm">80% Less Data Entry</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Instrument integration eliminates manual transcription. Results flow from ICP-MS, GC-MS, and IC directly into the LIMS.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-lab-teal/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6 text-lab-teal" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1 text-sm">Compliance Automation</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                ISO 17025 audit trails, QC enforcement, and report generation happen automatically. Your next assessment just got easier.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Calendly Scheduling Section */}
      <section id="schedule" className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
              Schedule a Live Demo
            </h2>
            <p className="text-slate-600 dark:text-slate-300 max-w-xl mx-auto">
              30 minutes with our founder. See your actual workflows demonstrated, ask questions, and decide if LIMS BOX fits your lab.
            </p>
          </div>

          {/* Calendly Inline Embed */}
          <CalendlyEmbed />

          {/* Contact Fallback */}
          <div className="mt-8 bg-slate-50 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl p-6 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
              Prefer to reach out directly? No problem.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm">
              <a href="mailto:info@lims.bot" className="text-lab-teal hover:underline font-medium">
                info@lims.bot
              </a>
              <span className="hidden sm:inline text-slate-300">|</span>
              <a href="tel:+17609604273" className="text-lab-teal hover:underline font-medium">
                (760) 960-4273
              </a>
              <span className="hidden sm:inline text-slate-300">|</span>
              <Link href="/contact" className="text-lab-teal hover:underline font-medium">
                Contact Form
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="py-8 px-4 bg-gradient-to-r from-lab-teal/10 to-lab-blue/10 dark:from-lab-teal/5 dark:to-lab-blue/5">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-sm">
            <div>
              <p className="font-bold text-slate-900 dark:text-white">ISO 17025</p>
              <p className="text-xs text-slate-500">Audit-ready</p>
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white">21 CFR Part 11</p>
              <p className="text-xs text-slate-500">Data integrity</p>
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white">Offline-Capable</p>
              <p className="text-xs text-slate-500">No internet needed</p>
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white">30-Day Pilot</p>
              <p className="text-xs text-slate-500">No obligation</p>
            </div>
          </div>
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
