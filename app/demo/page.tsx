'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  FlaskConical, ArrowRight, ArrowLeft, Check, ClipboardList,
  FileText, BarChart3, Droplets, Clock, Shield, User
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
            See LIMS BOX in Action
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300">
            Walk through a real workflow: logging a drinking water sample for nitrate testing, tracking chain of custody, and generating a compliance report.
          </p>
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

      {/* CTA */}
      <section className="py-12 px-4 bg-gradient-to-r from-lab-teal/10 to-lab-blue/10 dark:from-lab-teal/5 dark:to-lab-blue/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-4">
            That's the full workflow
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            Sample entry to compliance report in minutes — not hours. No copy-paste. No manual formatting. No holding time surprises.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-blue text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            See Pricing <ArrowRight className="w-4 h-4" />
          </Link>
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
