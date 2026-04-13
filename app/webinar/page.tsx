'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FlaskConical, Calendar, Clock, Users, Video, CheckCircle2, ArrowRight } from 'lucide-react';
import { WaitlistFooter } from '@/components/WaitlistFooter';
import type { Metadata } from 'next';

const upcomingSessions = [
  {
    id: 'env-labs-101',
    title: 'LIMS BOX for Environmental Labs',
    description: 'Live walkthrough of sample tracking, chain of custody, EPA method QC, and automated reporting for environmental and water testing labs.',
    date: '2026-04-22',
    time: '2:00 PM ET',
    duration: '45 min',
    spots: 20,
    audience: 'Environmental & Water Testing Labs',
  },
  {
    id: 'spreadsheet-migration',
    title: 'Migrating from Spreadsheets to LIMS BOX',
    description: 'Step-by-step demo of moving your Excel-based workflows into LIMS BOX. Data import, method setup, and analyst training — all in under 30 days.',
    date: '2026-04-29',
    time: '1:00 PM ET',
    duration: '30 min',
    spots: 25,
    audience: 'Labs Currently Using Spreadsheets',
  },
  {
    id: 'cannabis-labs',
    title: 'LIMS BOX for Cannabis Testing Labs',
    description: 'Compliance workflows, potency and terpene tracking, COA generation, and state reporting integrations for cannabis testing operations.',
    date: '2026-05-06',
    time: '3:00 PM ET',
    duration: '45 min',
    spots: 15,
    audience: 'Cannabis Testing Labs',
  },
  {
    id: 'senaite-deep-dive',
    title: 'Under the Hood: SENAITE + LIMS BOX Architecture',
    description: 'Technical deep dive into how LIMS BOX runs on SENAITE. Open-source LIMS core, the Pelican case deployment, voice interface, and offline operation.',
    date: '2026-05-13',
    time: '2:00 PM ET',
    duration: '60 min',
    spots: 30,
    audience: 'Lab IT & Technical Staff',
  },
];

export default function WebinarPage() {
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({ email: '', name: '', labName: '' });
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRegister(sessionId: string) {
    if (!formData.email || !formData.name) return;
    setSubmitting(true);

    try {
      await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          labName: formData.labName,
          source: `webinar:${sessionId}`,
        }),
      });
      setRegistered((prev) => new Set(prev).add(sessionId));
      setActiveSession(null);
    } catch {
      // silent fail — waitlist API is best-effort
    } finally {
      setSubmitting(false);
    }
  }

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

      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <div className="flex items-center justify-center gap-2 text-lab-teal mb-4">
            <Video className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Live Demos</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
            See LIMS BOX in action
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            Join a live 30-60 minute session. Ask questions, see your workflows demonstrated,
            and decide if LIMS BOX fits your lab.
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          {upcomingSessions.map((session) => (
            <div
              key={session.id}
              className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl p-6 md:p-8"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="text-xs font-medium text-lab-teal uppercase tracking-wider">
                    {session.audience}
                  </span>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                    {session.title}
                  </h2>
                </div>
                {registered.has(session.id) && (
                  <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                    <CheckCircle2 className="w-4 h-4" /> Registered
                  </span>
                )}
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                {session.description}
              </p>

              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 dark:text-slate-400 mb-4">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {new Date(session.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  {session.time} ({session.duration})
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  {session.spots} spots
                </span>
              </div>

              {registered.has(session.id) ? (
                <p className="text-sm text-green-600">
                  You&apos;re registered. We&apos;ll send the Zoom link to your email before the session.
                </p>
              ) : activeSession === session.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="Your name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lab-teal/50 placeholder:text-slate-400"
                    />
                    <input
                      type="email"
                      required
                      placeholder="your@email.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lab-teal/50 placeholder:text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Lab name (optional)"
                      value={formData.labName}
                      onChange={(e) => setFormData({ ...formData, labName: e.target.value })}
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lab-teal/50 placeholder:text-slate-400"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleRegister(session.id)}
                      disabled={submitting || !formData.email || !formData.name}
                      className="px-5 py-2 bg-lab-teal hover:bg-lab-teal/90 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {submitting ? 'Registering...' : 'Confirm Registration'}
                    </button>
                    <button
                      onClick={() => setActiveSession(null)}
                      className="px-5 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setActiveSession(session.id)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-lab-teal hover:bg-lab-teal/90 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Register for This Session
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <WaitlistFooter />
    </div>
  );
}
