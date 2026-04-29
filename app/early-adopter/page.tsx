'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  FlaskConical, ArrowRight, CheckCircle2, Shield, Users,
  Wrench, MessageSquare, Send
} from 'lucide-react';

const benefits = [
  { icon: Wrench, title: 'Dedicated onboarding', desc: 'We configure the system for your workflows, methods, and reporting requirements.' },
  { icon: MessageSquare, title: 'Direct engineering access', desc: 'Slack channel with the dev team. Your feedback shapes the product.' },
  { icon: Shield, title: 'Founding-member pricing', desc: 'Locked-in rate for the life of your subscription. Never increases.' },
  { icon: Users, title: 'Priority support', desc: 'Same-day response. Named account contact. Not a ticket queue.' },
];

const labTypes = [
  'Environmental / Water Testing',
  'Clinical / Medical',
  'Cannabis Testing',
  'Food & Beverage',
  'Forensic',
  'Pharmaceutical / QC',
  'Research / Academic',
  'Other',
];

export default function EarlyAdopterPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [form, setForm] = useState({
    labName: '',
    labType: '',
    contactName: '',
    email: '',
    testVolume: '',
    painPoint: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labName: form.labName,
          labType: form.labType,
          contactName: form.contactName,
          email: form.email,
          monthlyVolume: form.testVolume,
          painPoint: form.painPoint,
          source: 'lims.bot/early-adopter',
        }),
      });
      if (res.ok) {
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  const update = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }));

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
              { '@type': 'ListItem', position: 2, name: 'Early Adopter', item: 'https://lims.bot/early-adopter' },
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
              <span className="text-xl font-bold text-white">LIMS BOX</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-400">
              <Link href="/commercial" className="hover:text-white transition-colors">Commercial</Link>
              <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link href="/demo" className="hover:text-white transition-colors">Demo</Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-12 md:py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#2E8B57]/20 text-[#2E8B57] text-sm font-medium px-3 py-1 rounded-full mb-6 border border-[#2E8B57]/30">
            <Users className="w-4 h-4" /> 5 pilot slots available
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Early-Adopter Pilot Program
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            This isn't a free trial. It's a structured pilot for regulated labs that need
            audit-ready traceability and are willing to help shape the product.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="px-4 pb-12">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {benefits.map(b => (
            <div key={b.title} className="bg-white/5 border border-white/10 rounded-xl p-5 flex gap-4">
              <div className="w-10 h-10 rounded-lg bg-[#2E8B57]/20 flex items-center justify-center flex-shrink-0">
                <b.icon className="w-5 h-5 text-[#2E8B57]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">{b.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Application Form */}
      <section className="px-4 pb-16">
        <div className="max-w-2xl mx-auto">
          {status === 'success' ? (
            <div className="bg-white/5 border border-[#2E8B57]/30 rounded-2xl p-8 md:p-10 text-center">
              <CheckCircle2 className="w-16 h-16 text-[#2E8B57] mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Application received</h2>
              <p className="text-slate-400 mb-4">
                We review every application personally. Expect a response within 2 business days.
              </p>
              <Link href="/commercial" className="text-[#2E8B57] hover:underline text-sm font-medium">
                Watch the commercial while you wait
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 space-y-5">
              <div className="text-center mb-2">
                <h2 className="text-xl font-bold text-white">Apply for the pilot</h2>
                <p className="text-sm text-slate-500 mt-1">All fields required unless marked optional.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="labName" className="block text-sm font-medium text-slate-300 mb-1">Lab name *</label>
                  <input id="labName" type="text" required value={form.labName} onChange={update('labName')}
                    className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/50 placeholder:text-slate-600"
                    placeholder="Clear Creek Environmental Testing" />
                </div>
                <div>
                  <label htmlFor="labType" className="block text-sm font-medium text-slate-300 mb-1">Lab type *</label>
                  <select id="labType" required value={form.labType} onChange={update('labType')}
                    className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/50">
                    <option value="" className="bg-slate-800">Select...</option>
                    {labTypes.map(t => <option key={t} value={t} className="bg-slate-800">{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contactName" className="block text-sm font-medium text-slate-300 mb-1">Contact name *</label>
                  <input id="contactName" type="text" required value={form.contactName} onChange={update('contactName')}
                    className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/50 placeholder:text-slate-600"
                    placeholder="Rachel Moreno" />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">Email *</label>
                  <input id="email" type="email" required value={form.email} onChange={update('email')}
                    className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/50 placeholder:text-slate-600"
                    placeholder="rachel@clearcreeklab.com" />
                </div>
              </div>

              <div>
                <label htmlFor="testVolume" className="block text-sm font-medium text-slate-300 mb-1">Estimated test volume *</label>
                <select id="testVolume" required value={form.testVolume} onChange={update('testVolume')}
                  className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/50">
                  <option value="" className="bg-slate-800">Select monthly volume...</option>
                  <option value="under-100" className="bg-slate-800">Under 100 samples/month</option>
                  <option value="100-500" className="bg-slate-800">100–500 samples/month</option>
                  <option value="500-1000" className="bg-slate-800">500–1,000 samples/month</option>
                  <option value="1000-5000" className="bg-slate-800">1,000–5,000 samples/month</option>
                  <option value="over-5000" className="bg-slate-800">Over 5,000 samples/month</option>
                </select>
              </div>

              <div>
                <label htmlFor="painPoint" className="block text-sm font-medium text-slate-300 mb-1">Biggest pain point *</label>
                <textarea id="painPoint" required rows={3} value={form.painPoint} onChange={update('painPoint')}
                  className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/50 resize-none placeholder:text-slate-600"
                  placeholder="What's the #1 problem you'd solve with a better LIMS? (audit readiness, holding time tracking, reporting speed, data integrity, etc.)" />
              </div>

              <button type="submit" disabled={status === 'loading'}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#2E8B57] hover:bg-[#2E8B57]/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50">
                <Send className="w-4 h-4" />
                {status === 'loading' ? 'Submitting...' : 'Submit Application'}
              </button>

              {status === 'error' && (
                <p className="text-sm text-red-400 text-center">Something went wrong. Please try again or email info@lims.bot directly.</p>
              )}

              <p className="text-xs text-slate-600 text-center">
                We review every application. This is not an automated signup — we'll respond within 2 business days.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} LIMS BOX by Tombstone Dash LLC.</p>
          <div className="flex items-center gap-6">
            <a href="mailto:info@lims.bot" className="hover:text-white transition-colors">info@lims.bot</a>
            <Link href="/" className="hover:text-white transition-colors">lims.bot</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
