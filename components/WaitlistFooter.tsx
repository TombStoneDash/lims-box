'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FlaskConical, ArrowRight, CheckCircle2 } from 'lucide-react';

export function WaitlistFooter() {
  const [email, setEmail] = useState('');
  const [labName, setLabName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, labName }),
      });
      if (res.ok) {
        setStatus('success');
        setEmail('');
        setLabName('');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <footer className="border-t border-black/5 dark:border-white/5">
      {/* Waitlist CTA */}
      <div className="bg-gradient-to-r from-lab-teal/10 to-lab-blue/10 dark:from-lab-teal/5 dark:to-lab-blue/5 py-10 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Join the waitlist
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
            Be the first to know when LIMS BOX opens new pilot spots. No spam — just launch updates.
          </p>

          {status === 'success' ? (
            <div className="flex items-center justify-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">You're on the list. We'll be in touch.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-lab-teal/50 placeholder:text-slate-400"
              />
              <input
                type="text"
                value={labName}
                onChange={e => setLabName(e.target.value)}
                placeholder="Lab name (optional)"
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-lab-teal/50 placeholder:text-slate-400 sm:max-w-[180px]"
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="px-5 py-2.5 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {status === 'loading' ? '...' : <>Join <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}
          {status === 'error' && (
            <p className="text-sm text-red-500 mt-2">Something went wrong. Please try again.</p>
          )}
        </div>
      </div>

      {/* Footer links */}
      <div className="py-8 px-4 bg-white/50 dark:bg-black/20">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FlaskConical className="w-4 h-4 text-lab-teal" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">LIMS BOX</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Modern lab management for small testing labs.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Product</p>
              <ul className="space-y-2 text-sm">
                <li><Link href="/pricing" className="text-slate-600 dark:text-slate-300 hover:text-lab-teal transition-colors">Pricing</Link></li>
                <li><Link href="/demo" className="text-slate-600 dark:text-slate-300 hover:text-lab-teal transition-colors">Demo</Link></li>
                <li><Link href="/roi-calculator" className="text-slate-600 dark:text-slate-300 hover:text-lab-teal transition-colors">ROI Calculator</Link></li>
                <li><Link href="/case-study" className="text-slate-600 dark:text-slate-300 hover:text-lab-teal transition-colors">Case Study</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Industries</p>
              <ul className="space-y-2 text-sm">
                <li><Link href="/for/environmental-labs" className="text-slate-600 dark:text-slate-300 hover:text-lab-teal transition-colors">Environmental Labs</Link></li>
                <li><Link href="/for/cannabis-labs" className="text-slate-600 dark:text-slate-300 hover:text-lab-teal transition-colors">Cannabis Labs</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Resources</p>
              <ul className="space-y-2 text-sm">
                <li><Link href="/blog" className="text-slate-600 dark:text-slate-300 hover:text-lab-teal transition-colors">Blog</Link></li>
                <li><Link href="/contact" className="text-slate-600 dark:text-slate-300 hover:text-lab-teal transition-colors">Contact</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-6 border-t border-black/5 dark:border-white/5 text-center text-xs text-slate-500 dark:text-slate-400">
            <p>&copy; {new Date().getFullYear()} LIMS BOX by Tombstone Dash LLC.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
