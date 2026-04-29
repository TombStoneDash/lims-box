import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, Shield, FileText, Award, HeartPulse,
} from 'lucide-react';
import { WaitlistFooter } from '@/components/WaitlistFooter';
import { VideoSection } from '@/components/VideoSection';

// Same video ID as /commercial — swap together when the final cut is uploaded.
const COMMERCIAL_VIDEO_ID = process.env.NEXT_PUBLIC_COMMERCIAL_VIDEO_ID || 'D3cW20SbU3Y';
const DEMO_VIDEO_ID = 'AyR4LYKMUfM';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">
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
            href="/cola"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-lab-teal dark:hover:text-lab-teal mb-6 px-3 py-1 rounded-full border border-slate-200 dark:border-white/10 transition-colors"
          >
            Meet us at COLA Forum &middot; Nashville &middot; May 6&ndash;8 &rarr;
          </Link>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6 tracking-tight">
            The LIMS that doesn't need an IT department.
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-10 max-w-2xl mx-auto">
            Lab management for the labs that build and grow on real samples.
            Offline-capable, audit-ready, AI-powered.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              See the Demo
              <ArrowRight className="w-4 h-4" />
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

      {/* SENAITE / Ramon Bartl credibility callout */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-8 md:p-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-5">
              Built on SENAITE.{' '}
              <span className="text-lab-teal">With its founder.</span>
            </h2>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              THE LIMS BOX is built on SENAITE, the leading open-source
              Laboratory Information Management System, in active technical
              collaboration with its founder Ramon Bartl. We ship hardware,
              packaging, AI, and go-to-market — SENAITE provides the
              battle-tested LIMS core that runs labs around the world. The
              result is enterprise-grade laboratory infrastructure delivered in
              a rugged case for a fraction of the cost of conventional
              deployments.
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
              <span className="font-medium">CLIA Compliant</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <FileText className="w-5 h-5 text-lab-teal" />
              <span className="font-medium">EPA Reporting Built In</span>
            </div>
          </div>
        </div>
      </section>

      <WaitlistFooter />
    </div>
  );
}
