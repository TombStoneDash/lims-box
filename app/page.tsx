import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, Shield, FileText, Award, HeartPulse, BookOpen,
} from 'lucide-react';
import { WaitlistFooter } from '@/components/WaitlistFooter';
import { VideoSection } from '@/components/VideoSection';

// Same video ID as /commercial — swap together when the final cut is uploaded.
const COMMERCIAL_VIDEO_ID = process.env.NEXT_PUBLIC_COMMERCIAL_VIDEO_ID || 'D3cW20SbU3Y';
const DEMO_VIDEO_ID = 'AyR4LYKMUfM';

export default function HomePage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://lims.bot' },
    ],
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <header className="bg-white/80 dark:bg-black/80 backdrop-blur-sm border-b border-black/5 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo-icon.png"
                alt="LIMS BOX"
                width={32}
                height={32}
                className="rounded"
              />
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                LIMS BOX
              </span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <Link href="/pricing" className="hover:text-lab-teal transition-colors">Pricing</Link>
              <Link href="/demo" className="hover:text-lab-teal transition-colors">Demo</Link>
              <Link href="/blog" className="hover:text-lab-teal transition-colors">Blog</Link>
              <Link href="/contact" className="hover:text-lab-teal transition-colors">Contact</Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="relative h-1 w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-lab-blue via-lab-teal via-lab-green to-lab-blue animate-gradient" />
      </div>

      <section className="py-24 md:py-32 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <Link
            href="/clia"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-lab-teal dark:hover:text-lab-teal mb-6 px-3 py-1 rounded-full border border-slate-200 dark:border-white/10 transition-colors"
          >
            New: CLIA Tracker &middot; coming with the June launch &rarr;
          </Link>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6 tracking-tight">
            The LIMS that doesn't need an IT department.
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-10 max-w-2xl mx-auto">
            Lab management for labs that build and grow on real samples.
            Offline-capable. Built for survey readiness. Optional AI assistance.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/early-adopter"
              className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Apply for Early Access
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 bg-white dark:bg-white/10 hover:bg-slate-50 dark:hover:bg-white/20 text-slate-900 dark:text-white font-semibold px-6 py-3 rounded-lg border border-slate-200 dark:border-white/10 transition-colors"
            >
              See the Demo
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 bg-white dark:bg-white/10 hover:bg-slate-50 dark:hover:bg-white/20 text-slate-900 dark:text-white font-semibold px-6 py-3 rounded-lg border border-slate-200 dark:border-white/10 transition-colors"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Commercial */}
      <VideoSection videoId={COMMERCIAL_VIDEO_ID} />

      {/* SENAITE technology fact only — no partnership or endorsement claim */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-8 md:p-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-5">
              Built on SENAITE.{' '}
              <span className="text-lab-teal">Open source.</span>
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              LIMS BOX uses SENAITE, an open-source Laboratory Information
              Management System originally created by RidingBytes GmbH.
            </p>
          </div>
        </div>
      </section>

      {/* Product Demo Video */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-8">
            See It In Action
          </h2>
          <VideoSection videoId={DEMO_VIDEO_ID} />
        </div>
      </section>

      {/* ISO 15189 Personnel Pack */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-8 md:p-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-5">
              Personnel Pack — Now Built for CLIA and ISO 15189
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
              LIMS BOX Personnel Pack helps document personnel competency in alignment with both CLIA §493.1407 and ISO 15189 clause 6.2.2 — the two frameworks US labs are increasingly required to satisfy simultaneously.
            </p>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
              With COLA&apos;s 2026 authorization to evaluate labs against ISO 15189, the demand for dual-framework documentation is real. Personnel Pack v1.5 adds the metadata layer that bridges the gap: document version control for competency procedures, an internal audit log of competency review events, and procedure-specific authorization records — the three documentation elements ISO 15189 clause 6.2 requires beyond CLIA.
            </p>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-8">
              No additional cost. No new module to buy. Personnel Pack already covered 80% of the overlap. Version 1.5 closes the remaining 20%.
            </p>
            <Link
              href="/personnel-pack"
              className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              See Personnel Pack
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="py-8 px-4 bg-white/50 dark:bg-white/5 border-y border-black/5 dark:border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap justify-center gap-6 md:gap-10">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Award className="w-5 h-5 text-lab-teal" />
              <span className="font-medium">ISO 17025 Ready</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Shield className="w-5 h-5 text-lab-teal" />
              <span className="font-medium">21 CFR Part 11 Compatible</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <HeartPulse className="w-5 h-5 text-lab-teal" />
              <span className="font-medium">Supports CLIA Workflows</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <FileText className="w-5 h-5 text-lab-teal" />
              <span className="font-medium">EPA Reporting Built In</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <BookOpen className="w-5 h-5 text-lab-teal" />
              <span className="font-medium">ISO 15189 Personnel Ready</span>
            </div>
          </div>
        </div>
      </section>

      <WaitlistFooter />
    </div>
  );
}
