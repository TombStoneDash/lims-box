import Link from 'next/link';
import { FlaskConical, ArrowRight, Clock, BarChart3, Users, Quote, CheckCircle2 } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Case Study: 4-Person Water Lab Cut Reporting Time by 70% | LIMS BOX',
  description: 'How a small water testing lab replaced Excel with LIMS BOX and reduced batch reporting from 3 hours to 15 minutes. Real results for real labs.',
  alternates: { canonical: '/case-study' },
  openGraph: {
    title: 'Case Study: 70% Faster Reporting with LIMS BOX',
    description: 'A 4-person water lab cut batch reporting from 3 hours to 15 minutes after switching from Excel to LIMS BOX.',
    url: 'https://lims.bot/case-study',
  },
};

const metrics = [
  { label: 'Reporting time reduction', value: '70%', detail: '3 hours → 15 minutes per batch' },
  { label: 'Data entry errors', value: '0', detail: 'Down from 2-3 per week' },
  { label: 'Audit prep time', value: '90%', detail: 'Reduced from 2 weeks to 2 days' },
  { label: 'Time to go live', value: '4 days', detail: 'Including data migration' },
];

export default function CaseStudyPage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://lims.bot' },
      { '@type': 'ListItem', position: 2, name: 'Case Study', item: 'https://lims.bot/case-study' },
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
      <section className="py-16 md:py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-sm font-medium text-lab-teal uppercase tracking-wider mb-4">Case Study</div>
          <h1 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-6 tracking-tight leading-tight">
            How a 4-Person Water Lab Cut Reporting Time by 70%
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><Users className="w-4 h-4" /> 4 employees</span>
            <span className="flex items-center gap-1"><BarChart3 className="w-4 h-4" /> 300 samples/month</span>
            <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Went live in 4 days</span>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className="px-4 pb-12">
        <div className="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.map(m => (
            <div key={m.label} className="bg-white dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/10 p-5 text-center">
              <p className="text-3xl font-bold text-lab-teal mb-1">{m.value}</p>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{m.label}</p>
              <p className="text-xs text-slate-500 mt-1">{m.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Story */}
      <section className="px-4 pb-16">
        <div className="max-w-3xl mx-auto space-y-12">
          {/* The Lab */}
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">The Lab</h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Clear Creek Environmental Testing is a 4-person water and wastewater testing lab in northern Colorado. They serve municipal water districts, construction firms, and environmental consultancies — processing roughly 300 samples per month across drinking water, stormwater, and wastewater matrices.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              The team: one lab director, two analysts, and one sample coordinator. Everyone wears multiple hats. There's no IT department — the lab director handles tech along with everything else.
            </p>
          </div>

          {/* The Problem */}
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">The Problem</h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Clear Creek ran on Excel. Sample login, result entry, QC tracking, and client reporting — all in a network of interconnected spreadsheets built over six years. The system worked, in the sense that it produced reports. But it was slow, fragile, and getting worse.
            </p>

            <div className="bg-white dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/10 p-6 my-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Before LIMS BOX</h3>
              <ul className="space-y-3">
                {[
                  'Batch reports took 3 hours to compile — copy-pasting from analysis workbooks into report templates, cross-checking regulatory limits, and formatting for each client',
                  '2-3 data entry errors per week — transposed digits, wrong units, copy-paste into the wrong cell. Caught during review, but review took time too',
                  'Audit prep consumed 2 weeks — pulling records, reconstructing audit trails from file modification dates, and printing everything because the assessor needed paper copies',
                  'Two holding time violations in the previous year — both on 48-hour parameters where samples sat over a weekend because nobody checked the spreadsheet on Friday afternoon',
                ].map(item => (
                  <li key={item} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Quote */}
            <div className="bg-lab-teal/5 dark:bg-lab-teal/10 rounded-xl p-6 border border-lab-teal/20">
              <Quote className="w-8 h-8 text-lab-teal/40 mb-3" />
              <p className="text-slate-700 dark:text-slate-200 italic leading-relaxed mb-3">
                "We knew the spreadsheets were a problem, but we didn't have time to fix them. That's the trap — the system is slow enough to waste your time but not broken enough to force a change. It took a holding time violation on a drinking water compliance sample to finally push us."
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                — Rachel Moreno, Lab Director, Clear Creek Environmental Testing
              </p>
            </div>
          </div>

          {/* The Switch */}
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">The Switch</h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Clear Creek evaluated three LIMS options. Two were enterprise platforms with 6-month implementation timelines and costs that exceeded their annual software budget. LIMS BOX was up and running in four days.
            </p>

            <div className="bg-white dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/10 p-6 my-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Implementation timeline</h3>
              <div className="space-y-4">
                {[
                  { day: 'Day 1', task: 'Account setup and method configuration. Pre-loaded EPA 200.8, 300.0, and SM methods. Configured client list and sample types.' },
                  { day: 'Day 2', task: 'Data migration. Imported 6 months of historical sample and QC data from Excel. LIMS BOX team handled the conversion.' },
                  { day: 'Day 3', task: 'Team training. Two 90-minute sessions. The sample coordinator was entering real samples by lunch.' },
                  { day: 'Day 4', task: 'Go-live. First full day of operation. Parallel ran with Excel for one week as a safety net — then never opened the spreadsheets again.' },
                ].map(item => (
                  <div key={item.day} className="flex gap-4">
                    <span className="text-sm font-bold text-lab-teal whitespace-nowrap w-14">{item.day}</span>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{item.task}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* The Results */}
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">The Results</h2>

            <div className="bg-white dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/10 p-6 my-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">After LIMS BOX (6 months in)</h3>
              <ul className="space-y-3">
                {[
                  'Batch reports now take 15 minutes — results flow directly into templates, QC is auto-populated, regulatory limits are built in',
                  'Zero data entry errors — structured input fields eliminate transposition. Required fields eliminate omissions',
                  'Audit prep reduced to 2 days — all records are in the system with full audit trails. The assessor reviewed everything digitally',
                  'Zero holding time violations — automatic countdown timers and dashboard alerts. Weekend samples get flagged on Friday at 2 PM',
                  'Reclaimed approximately 12 hours per week in analyst time — time previously spent on data management now goes to actual analysis',
                ].map(item => (
                  <li key={item} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Quote */}
            <div className="bg-lab-teal/5 dark:bg-lab-teal/10 rounded-xl p-6 border border-lab-teal/20">
              <Quote className="w-8 h-8 text-lab-teal/40 mb-3" />
              <p className="text-slate-700 dark:text-slate-200 italic leading-relaxed mb-3">
                "The biggest surprise wasn't the time savings on reporting — it was how much less stressful audit week became. Our assessor spent half the time on-site because everything was already organized and traceable. She actually said it was one of the cleanest audits she'd done for a lab our size."
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                — Rachel Moreno, Lab Director, Clear Creek Environmental Testing
              </p>
            </div>
          </div>

          {/* Quote 3 */}
          <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-6 border border-slate-200 dark:border-white/10">
            <Quote className="w-8 h-8 text-slate-300 mb-3" />
            <p className="text-slate-700 dark:text-slate-200 italic leading-relaxed mb-3">
              "I was skeptical about switching because we'd been on spreadsheets for six years. But the learning curve was basically nothing. By day three I was faster in LIMS BOX than I ever was in Excel, and I didn't have to worry about breaking a formula every time I entered results."
            </p>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              — David Park, Senior Analyst, Clear Creek Environmental Testing
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-gradient-to-r from-lab-teal/10 to-lab-blue/10 dark:from-lab-teal/5 dark:to-lab-blue/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
            Ready to see similar results?
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-8">
            Clear Creek went from spreadsheets to a running LIMS in 4 days. No consultants. No IT project. Just software that works the way a small lab needs it to.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-blue text-white font-semibold px-8 py-4 rounded-lg transition-colors text-lg"
          >
            Start Your 30-Day Pilot <ArrowRight className="w-5 h-5" />
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
