'use client';

import Link from 'next/link';
import { FlaskConical, ArrowRight, Play, Shield, Award, FileText } from 'lucide-react';
import { useState } from 'react';

export default function CommercialPage() {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="min-h-screen bg-[#0F172A]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://lims.bot' },
              { '@type': 'ListItem', position: 2, name: 'Commercial', item: 'https://lims.bot/commercial' },
            ],
          }),
        }}
      />

      {/* Header */}
      <header className="bg-black/40 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-[#2E8B57]" />
              <span className="text-xl font-bold text-white">THE LIMS BOX</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-400">
              <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link href="/demo" className="hover:text-white transition-colors">Demo</Link>
              <Link href="/early-adopter" className="hover:text-white transition-colors">Early Adopter</Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Video Section */}
      <section className="px-4 pt-8 pb-4">
        <div className="max-w-4xl mx-auto">
          {/* Video Player */}
          <div className="relative aspect-video bg-[#1E3A5F] rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
            {!playing ? (
              <>
                {/* Placeholder poster */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#1E3A5F] to-[#0F172A]">
                  <FlaskConical className="w-16 h-16 text-[#2E8B57] mb-4" />
                  <h2 className="text-2xl md:text-4xl font-bold text-white mb-2 tracking-tight">THE LIMS BOX</h2>
                  <p className="text-sm text-slate-400 mb-8">Right-sized for regulated labs.</p>
                  <button
                    onClick={() => setPlaying(true)}
                    className="w-20 h-20 rounded-full bg-[#2E8B57] hover:bg-[#2E8B57]/90 flex items-center justify-center transition-all hover:scale-105 shadow-lg shadow-[#2E8B57]/30"
                  >
                    <Play className="w-8 h-8 text-white ml-1" />
                  </button>
                  <p className="text-xs text-slate-500 mt-4">Coming soon — video in production</p>
                </div>
              </>
            ) : (
              <>
                {/* TODO: Replace with actual video embed (Vimeo/YouTube/Mux) */}
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <div className="text-center">
                    <FlaskConical className="w-12 h-12 text-[#2E8B57] mx-auto mb-4 animate-pulse" />
                    <p className="text-white text-lg font-medium">Video placeholder</p>
                    <p className="text-slate-400 text-sm mt-1">Replace with Vimeo/YouTube/Mux embed URL</p>
                    <button
                      onClick={() => setPlaying(false)}
                      className="mt-4 text-xs text-slate-500 hover:text-white transition-colors"
                    >
                      Back to poster
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Tagline */}
      <section className="px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Enterprise-grade traceability.<br />
            <span className="text-[#2E8B57]">No enterprise overhead.</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Every sample tracked. Every action logged. Every record audit-ready.
            Built for labs under 50 people that can't afford to fail an inspection.
          </p>
        </div>
      </section>

      {/* Trust badges */}
      <section className="px-4 pb-8">
        <div className="max-w-3xl mx-auto flex flex-wrap justify-center gap-6 md:gap-10">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Award className="w-5 h-5 text-[#2E8B57]" />
            <span>ISO 17025 Ready</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Shield className="w-5 h-5 text-[#2E8B57]" />
            <span>21 CFR Part 11</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <FileText className="w-5 h-5 text-[#2E8B57]" />
            <span>CAP-Ready</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Shield className="w-5 h-5 text-[#2E8B57]" />
            <span>Offline-Capable</span>
          </div>
        </div>
      </section>

      {/* Early Adopter CTA */}
      <section className="px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="bg-gradient-to-br from-[#1E3A5F] to-[#1E3A5F]/60 border border-[#2E8B57]/30 rounded-2xl p-8 md:p-10 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
              Apply for the Early-Adopter Program
            </h2>
            <p className="text-slate-300 mb-2 max-w-lg mx-auto">
              We're selecting 5 regulated labs for a structured pilot. Dedicated onboarding.
              Direct line to the engineering team. Founding-member pricing locked in.
            </p>
            <p className="text-sm text-slate-500 mb-6">
              Not a free trial — a partnership. Limited spots.
            </p>
            <Link
              href="/early-adopter"
              className="inline-flex items-center gap-2 bg-[#2E8B57] hover:bg-[#2E8B57]/90 text-white font-semibold px-8 py-4 rounded-lg transition-colors text-lg"
            >
              Apply Now <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} THE LIMS BOX by Tombstone Dash LLC.</p>
          <div className="flex items-center gap-6">
            <a href="mailto:info@lims.bot" className="hover:text-white transition-colors">info@lims.bot</a>
            <Link href="/" className="hover:text-white transition-colors">lims.bot</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
