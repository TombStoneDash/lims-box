'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  FlaskConical, ArrowRight, CheckCircle2, Shield, Users,
  Wrench, MessageSquare, Send
} from 'lucide-react';
import {
  EARLY_ACCESS_LAB_TYPES,
  EARLY_ACCESS_LIMITS,
  EARLY_ACCESS_VOLUME_OPTIONS,
} from '@/lib/earlyAccessApplication';

const benefits = [
  { icon: Wrench, title: 'Pilot onboarding plan', desc: 'We document the workflows, methods, and reporting requirements included in the pilot.' },
  { icon: MessageSquare, title: 'Direct product feedback', desc: 'Share structured feedback with the product team during the pilot.' },
  { icon: Shield, title: 'Written pilot pricing', desc: 'Pricing and pilot duration are confirmed in writing before enrollment.' },
  { icon: Users, title: 'Defined support plan', desc: 'Support channels and response targets are confirmed before enrollment.' },
];

export default function EarlyAdopterPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [isWaterLane, setIsWaterLane] = useState(false);
  const [form, setForm] = useState({
    labName: '',
    labType: '',
    contactName: '',
    email: '',
    testVolume: '',
    painPoint: '',
    dataUseAccepted: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('utm_campaign') !== 'water_lane') return;

    setIsWaterLane(true);
    setForm(current => current.labType
      ? current
      : { ...current, labType: 'Environmental / Water Testing' });
  }, []);

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
          dataUseAccepted: form.dataUseAccepted,
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

  const updateDataUse = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, dataUseAccepted: e.target.checked }));
  };

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
            <Users className="w-4 h-4" /> {isWaterLane ? 'Water-lab walkthrough' : '5 pilot slots available'}
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            {isWaterLane ? 'Field Scout Water-Lab Pilot' : 'Early-Adopter Pilot Program'}
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            {isWaterLane
              ? 'Tell us how your team moves field equipment and sample context from collection site to laboratory bench.'
              : "This isn't a free trial. It's a structured pilot for regulated labs that need survey-ready traceability and are willing to help shape the product."}
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
                We review every application personally and will contact you after review.
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
                <p className="text-xs text-slate-500 mt-2">
                  Review the{' '}
                  <a href="#application-data-use" className="text-[#2E8B57] hover:underline">
                    application privacy and data-use notice
                  </a>{' '}
                  before submitting.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="labName" className="block text-sm font-medium text-slate-300 mb-1">Lab name *</label>
                  <input id="labName" type="text" required value={form.labName} onChange={update('labName')}
                    maxLength={EARLY_ACCESS_LIMITS.labName}
                    className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/50 placeholder:text-slate-600"
                    placeholder="Riverside Water Testing" />
                </div>
                <div>
                  <label htmlFor="labType" className="block text-sm font-medium text-slate-300 mb-1">Lab type *</label>
                  <select id="labType" required value={form.labType} onChange={update('labType')}
                    className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/50">
                    <option value="" className="bg-slate-800">Select...</option>
                    {EARLY_ACCESS_LAB_TYPES.map(t => <option key={t} value={t} className="bg-slate-800">{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contactName" className="block text-sm font-medium text-slate-300 mb-1">Contact name *</label>
                  <input id="contactName" type="text" required value={form.contactName} onChange={update('contactName')}
                    maxLength={EARLY_ACCESS_LIMITS.contactName}
                    className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/50 placeholder:text-slate-600"
                    placeholder="Jane Smith" />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">Email *</label>
                  <input id="email" type="email" required value={form.email} onChange={update('email')}
                    maxLength={EARLY_ACCESS_LIMITS.email}
                    className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/50 placeholder:text-slate-600"
                    placeholder="rachel@clearcreeklab.com" />
                </div>
              </div>

              <div>
                <label htmlFor="testVolume" className="block text-sm font-medium text-slate-300 mb-1">Estimated test volume *</label>
                <select id="testVolume" required value={form.testVolume} onChange={update('testVolume')}
                  className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/50">
                  <option value="" className="bg-slate-800">Select monthly volume...</option>
                  {EARLY_ACCESS_VOLUME_OPTIONS.map(option => (
                    <option key={option.value} value={option.value} className="bg-slate-800">
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="painPoint" className="block text-sm font-medium text-slate-300 mb-1">Biggest pain point *</label>
                <textarea id="painPoint" required rows={3} value={form.painPoint} onChange={update('painPoint')}
                  maxLength={EARLY_ACCESS_LIMITS.painPoint}
                  className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#2E8B57]/50 resize-none placeholder:text-slate-600"
                  placeholder="What's the #1 problem you'd solve with a better LIMS? (audit readiness, holding time tracking, reporting speed, data integrity, etc.)" />
              </div>

              <div id="application-data-use" className="rounded-lg border border-white/10 bg-black/20 p-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Application data is stored so the LIMS BOX team can review and respond to your
                  pilot request. Use this form only for business contact and workflow-fit
                  information. Do not include patient identifiers, PHI, sample results, customer
                  records, credentials, or other sensitive or regulated data.
                </p>
                <label className="mt-3 flex items-start gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    required
                    checked={form.dataUseAccepted}
                    onChange={updateDataUse}
                    className="mt-0.5"
                  />
                  <span>
                    I have read the{' '}
                    <a href="#application-data-use" className="text-[#2E8B57] hover:underline">
                      application data-use notice
                    </a>{' '}
                    and will not submit sensitive or regulated data.
                  </span>
                </label>
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
                We review every application. This is not an automated signup — we'll contact you after review.
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
