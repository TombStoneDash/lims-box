import Link from 'next/link';
import { FlaskConical, Download, Image, FileText, User } from 'lucide-react';

const logos = [
  { name: 'Logo — Dark Background', file: '/press/logo-dark.svg', desc: 'White text on dark. For dark backgrounds.' },
  { name: 'Logo — Light Background', file: '/press/logo-light.svg', desc: 'Dark text on light. For white/light backgrounds.' },
  { name: 'Icon Only', file: '/press/logo-icon.svg', desc: 'Square icon mark. For favicons, social, and small formats.' },
  { name: 'Primary Badge', file: '/logo-primary.jpg', desc: 'Parachute box logo with wordmark. For marketing materials.' },
  { name: 'Metallic Badge', file: '/logo-metallic.jpg', desc: '3D metallic finish. For presentations and premium materials.' },
  { name: '3D Badge', file: '/logo-badge.jpg', desc: 'Embossed badge style. For social media and hero sections.' },
];

const screenshots = [
  { name: 'Dashboard', file: '/press/screenshot-dashboard.svg' },
  { name: 'Sample Tracking', file: '/press/screenshot-sample-tracking.svg' },
  { name: 'QC Charts', file: '/press/screenshot-qc-charts.svg' },
  { name: 'Reporting', file: '/press/screenshot-reporting.svg' },
];

export default function PressPage() {
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
              { '@type': 'ListItem', position: 2, name: 'Press', item: 'https://lims.bot/press' },
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
              <span className="text-xl font-bold text-slate-900 dark:text-white">THE LIMS BOX</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <Link href="/commercial" className="hover:text-lab-teal transition-colors">Commercial</Link>
              <Link href="/pricing" className="hover:text-lab-teal transition-colors">Pricing</Link>
              <Link href="/contact" className="hover:text-lab-teal transition-colors">Contact</Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="relative h-1 w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-lab-blue via-lab-teal via-lab-green to-lab-blue animate-gradient" />
      </div>

      {/* Hero */}
      <section className="py-12 md:py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
            Press Kit
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300">
            Logos, screenshots, and company information for media coverage.
          </p>
          <p className="text-sm text-slate-500 mt-2">
            Media inquiries: <a href="mailto:info@lims.bot" className="text-lab-teal hover:underline">info@lims.bot</a>
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 pb-16 space-y-16">

        {/* Company Boilerplate */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-lab-teal" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">About THE LIMS BOX</h2>
          </div>
          <div className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl p-6 space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            <p>
              <strong className="text-slate-900 dark:text-white">THE LIMS BOX</strong> is a laboratory information management system built for regulated labs under 50 people. It delivers enterprise-grade traceability — sample tracking, chain of custody, audit trails, QC management, and compliance reporting — without the enterprise overhead.
            </p>
            <p>
              Founded in 2026 by Tombstone Dash LLC, THE LIMS BOX targets environmental testing labs, water quality labs, cannabis testing facilities, and clinical labs that are stuck between spreadsheets they've outgrown and enterprise platforms they can't afford. The system is built on SENAITE, an open-source LIMS framework, extended with voice control, AI-assisted queries, and offline capability.
            </p>
            <p>
              Pricing starts at $500/month with no implementation fee, no long-term contract, and go-live in days instead of months. The company is currently running a 5-lab early-adopter pilot program with founding-member pricing and direct engineering access.
            </p>
            <div className="pt-2 border-t border-black/5 dark:border-white/5 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div><p className="text-slate-500">Founded</p><p className="font-medium text-slate-900 dark:text-white">2026</p></div>
              <div><p className="text-slate-500">Headquarters</p><p className="font-medium text-slate-900 dark:text-white">Arizona, USA</p></div>
              <div><p className="text-slate-500">Website</p><p className="font-medium text-lab-teal">lims.bot</p></div>
              <div><p className="text-slate-500">Contact</p><p className="font-medium text-lab-teal">info@lims.bot</p></div>
            </div>
          </div>
        </section>

        {/* Founder Bio */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-lab-teal" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Founder</h2>
          </div>
          <div className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-[#1E3A5F] flex items-center justify-center flex-shrink-0">
                <span className="text-xl font-bold text-[#2E8B57]">HT</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Hudson Taylor</h3>
                <p className="text-sm text-lab-teal mb-3">Founder & CEO, Tombstone Dash LLC</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Hudson Taylor is the founder of Tombstone Dash LLC and creator of THE LIMS BOX. With a background in lab informatics and software engineering, Hudson identified the gap between enterprise LIMS platforms that cost six figures and the spreadsheet chaos that small regulated labs default to. THE LIMS BOX is his answer: audit-ready traceability that deploys in days, not months, at a price point small labs can justify. He is building the company through a network of VC connectors and strategic partnerships with the SENAITE open-source community.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Logos */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Download className="w-5 h-5 text-lab-teal" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Logos</h2>
          </div>
          <p className="text-sm text-slate-500 mb-4">Right-click and &quot;Save As&quot; or click to download. SVG format — scales to any size.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {logos.map(logo => (
              <a
                key={logo.file}
                href={logo.file}
                download
                className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl p-4 hover:shadow-md transition-shadow group"
              >
                <div className="aspect-[4/1] bg-slate-100 dark:bg-white/5 rounded-lg flex items-center justify-center mb-3 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo.file} alt={logo.name} className="max-h-12" />
                </div>
                <p className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-lab-teal transition-colors">{logo.name}</p>
                <p className="text-xs text-slate-500">{logo.desc}</p>
              </a>
            ))}
          </div>
        </section>

        {/* Screenshots */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Image className="w-5 h-5 text-lab-teal" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Product Screenshots</h2>
          </div>
          <p className="text-sm text-slate-500 mb-4">Click to download. Replace placeholders with actual screenshots as they become available.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {screenshots.map(ss => (
              <a
                key={ss.file}
                href={ss.file}
                download
                className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl overflow-hidden hover:shadow-md transition-shadow group"
              >
                <div className="aspect-video bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ss.file} alt={ss.name} className="w-full h-full object-cover" />
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-lab-teal transition-colors">{ss.name}</p>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Brand Colors */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Brand Colors</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Navy', hex: '#1E3A5F', text: 'white' },
              { name: 'Green', hex: '#2E8B57', text: 'white' },
              { name: 'Dark', hex: '#0F172A', text: 'white' },
              { name: 'Light', hex: '#F8FAFC', text: '#0F172A' },
            ].map(c => (
              <div key={c.hex} className="rounded-xl overflow-hidden border border-black/5 dark:border-white/10">
                <div className="h-16" style={{ backgroundColor: c.hex }} />
                <div className="p-3 bg-white dark:bg-white/5">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{c.name}</p>
                  <p className="text-xs text-slate-500 font-mono">{c.hex}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="py-8 px-4 border-t border-black/5 dark:border-white/5">
        <div className="max-w-7xl mx-auto text-center text-sm text-slate-500 dark:text-slate-400">
          <p>&copy; {new Date().getFullYear()} THE LIMS BOX by Tombstone Dash LLC.</p>
        </div>
      </footer>
    </div>
  );
}
