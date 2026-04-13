'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FlaskConical, ArrowRight, Calculator, DollarSign, Clock, TrendingDown } from 'lucide-react';

type CurrentTool = 'excel' | 'paper' | 'other-lims';

function calculateROI(samplesPerMonth: number, staffCount: number, currentTool: CurrentTool) {
  // Time per sample (minutes) by current tool
  const timePerSample: Record<CurrentTool, number> = {
    'excel': 12,
    'paper': 18,
    'other-lims': 6,
  };

  // LIMS BOX time per sample (minutes)
  const limsBoxTimePerSample = 4;

  // Error rates (% of samples with data entry errors)
  const errorRates: Record<CurrentTool, number> = {
    'excel': 3.5,
    'paper': 6.0,
    'other-lims': 1.5,
  };
  const limsBoxErrorRate = 0.2;

  // Monthly reporting hours by tool
  const reportingHoursPerBatch: Record<CurrentTool, number> = {
    'excel': 3,
    'paper': 4.5,
    'other-lims': 1.5,
  };
  const limsBoxReportingHoursPerBatch = 0.25;
  const batchesPerMonth = Math.ceil(samplesPerMonth / 20);

  // Calculations
  const currentMinutesPerMonth = samplesPerMonth * timePerSample[currentTool];
  const limsBoxMinutesPerMonth = samplesPerMonth * limsBoxTimePerSample;
  const dataMgmtHoursSaved = Math.round((currentMinutesPerMonth - limsBoxMinutesPerMonth) / 60);

  const currentReportingHours = batchesPerMonth * reportingHoursPerBatch[currentTool];
  const limsBoxReportingHours = batchesPerMonth * limsBoxReportingHoursPerBatch;
  const reportingHoursSaved = Math.round(currentReportingHours - limsBoxReportingHours);

  const totalHoursSaved = dataMgmtHoursSaved + reportingHoursSaved;

  const errorReduction = Math.round(((errorRates[currentTool] - limsBoxErrorRate) / errorRates[currentTool]) * 100);

  // Cost calculation (avg lab tech rate $35/hr)
  const hourlyRate = 35;
  const monthlySavings = totalHoursSaved * hourlyRate;

  // Current tool cost estimate
  const currentToolCost: Record<CurrentTool, number> = {
    'excel': 0,
    'paper': 50,
    'other-lims': 2500,
  };

  const limsBoxCost = staffCount <= 3 ? 500 : staffCount <= 10 ? 1200 : 2500;
  const netMonthlySavings = monthlySavings - limsBoxCost + currentToolCost[currentTool];

  return {
    totalHoursSaved,
    dataMgmtHoursSaved,
    reportingHoursSaved,
    errorReduction,
    monthlySavings,
    limsBoxCost,
    netMonthlySavings,
    currentToolCost: currentToolCost[currentTool],
    annualSavings: netMonthlySavings * 12,
  };
}

export default function ROICalculatorPage() {
  const [samples, setSamples] = useState(200);
  const [staff, setStaff] = useState(5);
  const [tool, setTool] = useState<CurrentTool>('excel');

  const roi = calculateROI(samples, staff, tool);

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
              { '@type': 'ListItem', position: 2, name: 'ROI Calculator', item: 'https://lims.bot/roi-calculator' },
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
      <section className="py-12 md:py-16 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-lab-teal/10 text-lab-teal text-sm font-medium px-3 py-1 rounded-full mb-4">
            <Calculator className="w-4 h-4" /> ROI Calculator
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
            What's your lab losing to manual work?
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300">
            Enter your lab's details and see how much time and money you could save with LIMS BOX.
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Inputs */}
          <div className="bg-white dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/10 p-6 md:p-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Your lab</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Samples per month
                </label>
                <input
                  type="range"
                  min={50}
                  max={2000}
                  step={50}
                  value={samples}
                  onChange={e => setSamples(Number(e.target.value))}
                  className="w-full accent-[#0D9488]"
                />
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-400">50</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">{samples}</span>
                  <span className="text-slate-400">2,000</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Number of staff
                </label>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={staff}
                  onChange={e => setStaff(Number(e.target.value))}
                  className="w-full accent-[#0D9488]"
                />
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-400">1</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">{staff}</span>
                  <span className="text-slate-400">50</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Current tool
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'excel' as const, label: 'Excel / Sheets' },
                    { id: 'paper' as const, label: 'Paper / Manual' },
                    { id: 'other-lims' as const, label: 'Other LIMS' },
                  ]).map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setTool(opt.id)}
                      className={`py-2.5 px-3 rounded-lg text-sm font-medium transition-colors border ${
                        tool === opt.id
                          ? 'bg-lab-teal text-white border-lab-teal'
                          : 'bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-lab-teal/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/10 p-6 md:p-8">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Your estimated savings</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-lab-teal/5 dark:bg-lab-teal/10 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-lab-teal" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Hours saved per month</p>
                      <p className="text-xs text-slate-500">Data entry + reporting</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-lab-teal">{roi.totalHoursSaved}h</p>
                </div>

                <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                  <div className="flex items-center gap-3">
                    <TrendingDown className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Error reduction</p>
                      <p className="text-xs text-slate-500">Data entry errors eliminated</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-green-600">{roi.errorReduction}%</p>
                </div>

                <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <div className="flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Net monthly savings</p>
                      <p className="text-xs text-slate-500">Labor savings minus LIMS BOX cost</p>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${roi.netMonthlySavings >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                    ${Math.abs(roi.netMonthlySavings).toLocaleString()}
                    {roi.netMonthlySavings < 0 ? '*' : ''}
                  </p>
                </div>
              </div>
            </div>

            {/* Breakdown */}
            <div className="bg-white dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/10 p-6">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Monthly breakdown</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Data management time saved</span>
                  <span className="font-medium">{roi.dataMgmtHoursSaved}h</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Reporting time saved</span>
                  <span className="font-medium">{roi.reportingHoursSaved}h</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Labor savings (@ $35/hr)</span>
                  <span className="font-medium text-green-600">+${roi.monthlySavings.toLocaleString()}</span>
                </div>
                {roi.currentToolCost > 0 && (
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>Current tool cost eliminated</span>
                    <span className="font-medium text-green-600">+${roi.currentToolCost.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>LIMS BOX subscription</span>
                  <span className="font-medium text-red-500">-${roi.limsBoxCost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-white/10 font-semibold text-slate-900 dark:text-white">
                  <span>Annual net savings</span>
                  <span className={roi.annualSavings >= 0 ? 'text-green-600' : 'text-red-500'}>
                    ${Math.abs(roi.annualSavings).toLocaleString()}/yr
                  </span>
                </div>
              </div>
            </div>

            <Link
              href="/contact"
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold rounded-lg transition-colors"
            >
              Start Your 30-Day Pilot <ArrowRight className="w-4 h-4" />
            </Link>

            <p className="text-xs text-slate-400 text-center">
              Estimates based on industry benchmarks. Actual savings vary by lab. No obligation.
            </p>
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
