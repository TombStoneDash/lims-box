import Link from 'next/link';
import { FlaskConical, ExternalLink, Code2, Shield, Globe, Heart } from 'lucide-react';
import { WaitlistFooter } from '@/components/WaitlistFooter';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Partners — LIMS BOX | Built on SENAITE with RidingBytes',
  description: 'LIMS BOX is built on SENAITE, the open-source LIMS by RidingBytes. Our partnership brings enterprise-grade lab management to small environmental and water testing labs.',
  alternates: { canonical: '/partners' },
  openGraph: {
    title: 'Partners — LIMS BOX',
    description: 'Built on SENAITE open-source LIMS. Partnered with RidingBytes to bring enterprise lab management to small labs.',
    url: 'https://lims.bot/partners',
  },
};

export default function PartnersPage() {
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
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
            Built on open source. Backed by experts.
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            LIMS BOX stands on the shoulders of SENAITE &mdash; the most capable open-source LIMS in the world &mdash;
            developed by RidingBytes in Germany.
          </p>
        </div>
      </section>

      {/* SENAITE Partner Card */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-8 md:p-12 mb-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <span className="text-xs font-medium text-lab-teal uppercase tracking-wider">Core Technology Partner</span>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white mt-2">SENAITE</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">by RidingBytes GmbH &middot; Bonn, Germany</p>
              </div>
              <a
                href="https://www.senaite.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-lab-teal hover:underline"
              >
                senaite.com <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-8">
              SENAITE is an enterprise-grade, open-source Laboratory Information Management System built on
              Python and Plone. It powers accredited labs worldwide &mdash; environmental, clinical, food safety,
              and pharmaceutical. RidingBytes has been building LIMS software for over a decade, and SENAITE
              is their flagship product: fully extensible, ISO 17025 capable, and backed by a thriving
              contributor community.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-5">
                <Code2 className="w-5 h-5 text-lab-teal mb-3" />
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1 text-sm">Open Source Core</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  GPL-licensed. Full source code on GitHub. No vendor lock-in. Audit the code yourself.
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-5">
                <Shield className="w-5 h-5 text-lab-teal mb-3" />
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1 text-sm">ISO 17025 Ready</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Built-in audit trails, electronic signatures, sample traceability, and QC management.
                </p>
              </div>
              <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-5">
                <Globe className="w-5 h-5 text-lab-teal mb-3" />
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1 text-sm">Global Community</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Used by labs on every continent. Active community of developers, integrators, and lab professionals.
                </p>
              </div>
            </div>

            <div className="bg-lab-teal/5 dark:bg-lab-teal/10 border border-lab-teal/20 rounded-xl p-6">
              <h3 className="font-bold text-slate-900 dark:text-white mb-2">How LIMS BOX Uses SENAITE</h3>
              <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <li className="flex gap-2">
                  <Heart className="w-4 h-4 text-lab-teal mt-0.5 shrink-0" />
                  <span><strong>SENAITE is the LIMS engine.</strong> All sample tracking, QC management, and analytical workflows run on SENAITE&apos;s proven core.</span>
                </li>
                <li className="flex gap-2">
                  <Heart className="w-4 h-4 text-lab-teal mt-0.5 shrink-0" />
                  <span><strong>LIMS BOX is the delivery layer.</strong> We package SENAITE into a turnkey deployment &mdash; the Pelican case hardware, voice interface, pre-configured methods, and simplified onboarding.</span>
                </li>
                <li className="flex gap-2">
                  <Heart className="w-4 h-4 text-lab-teal mt-0.5 shrink-0" />
                  <span><strong>We contribute upstream.</strong> Bug fixes, environmental testing workflows, and EPA method templates flow back into the SENAITE project.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* RidingBytes Card */}
          <div className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-8 md:p-12">
            <div className="flex items-start justify-between mb-6">
              <div>
                <span className="text-xs font-medium text-lab-blue uppercase tracking-wider">Development Partner</span>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white mt-2">RidingBytes</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Bonn, Germany</p>
              </div>
              <a
                href="https://www.ridingbytes.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-lab-teal hover:underline"
              >
                ridingbytes.com <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-6">
              RidingBytes is the company behind SENAITE. Founded by Ramon Bartl and Lukas Graf, they
              specialize in laboratory informatics, Plone-based web applications, and scientific data management.
              Their team brings deep expertise in regulated laboratory workflows, data integrity requirements,
              and the specific challenges of accredited testing laboratories.
            </p>

            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              LIMS BOX partners with RidingBytes for ongoing SENAITE development, custom environmental
              testing integrations, and technical consultation on ISO 17025 compliance. When you use LIMS BOX,
              you&apos;re backed by the people who built the LIMS engine your data runs on.
            </p>
          </div>
        </div>
      </section>

      <WaitlistFooter />
    </div>
  );
}
