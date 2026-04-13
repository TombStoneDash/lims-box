'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FlaskConical, Send, CheckCircle2, Mail, Building2, Users } from 'lucide-react';

export default function ContactPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [form, setForm] = useState({
    name: '',
    labName: '',
    email: '',
    labSize: '',
    currentSystem: '',
    message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setStatus('success');
        setForm({ name: '', labName: '', email: '', labSize: '', currentSystem: '', message: '' });
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

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
              { '@type': 'ListItem', position: 2, name: 'Contact', item: 'https://lims.bot/contact' },
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
              <span className="text-xl font-bold text-slate-900 dark:text-white">LIMS BOX</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <Link href="/pricing" className="hover:text-lab-teal transition-colors">Pricing</Link>
              <Link href="/demo" className="hover:text-lab-teal transition-colors">Demo</Link>
              <Link href="/blog" className="hover:text-lab-teal transition-colors">Blog</Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="relative h-1 w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-lab-blue via-lab-teal via-lab-green to-lab-blue animate-gradient" />
      </div>

      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-12">
          {/* Left — info */}
          <div className="lg:col-span-2">
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
              Let's talk about your lab
            </h1>
            <p className="text-slate-600 dark:text-slate-300 mb-8">
              Whether you're ready to start a pilot or just want to learn more, we'd love to hear from you. No sales pressure — just a conversation about what your lab needs.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-lab-teal mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Email</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">info@lims.bot</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-lab-teal mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Company</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Tombstone Dash LLC</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-lab-teal mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Built for</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Labs under 50 people</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right — form */}
          <div className="lg:col-span-3">
            {status === 'success' ? (
              <div className="bg-white dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/10 p-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Message sent</h2>
                <p className="text-slate-600 dark:text-slate-300">We'll get back to you within one business day.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-white dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/10 p-6 md:p-8 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Your name *
                    </label>
                    <input
                      id="name"
                      type="text"
                      required
                      value={form.name}
                      onChange={update('name')}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-lab-teal/50"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Email *
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={update('email')}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-lab-teal/50"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="labName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Lab name *
                  </label>
                  <input
                    id="labName"
                    type="text"
                    required
                    value={form.labName}
                    onChange={update('labName')}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-lab-teal/50"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="labSize" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Lab size
                    </label>
                    <select
                      id="labSize"
                      value={form.labSize}
                      onChange={update('labSize')}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-lab-teal/50"
                    >
                      <option value="">Select...</option>
                      <option value="1-5">1-5 people</option>
                      <option value="6-15">6-15 people</option>
                      <option value="16-30">16-30 people</option>
                      <option value="31-50">31-50 people</option>
                      <option value="50+">50+ people</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="currentSystem" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Current system
                    </label>
                    <select
                      id="currentSystem"
                      value={form.currentSystem}
                      onChange={update('currentSystem')}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-lab-teal/50"
                    >
                      <option value="">Select...</option>
                      <option value="excel">Excel / Google Sheets</option>
                      <option value="paper">Paper / Manual</option>
                      <option value="other-lims">Another LIMS</option>
                      <option value="none">Nothing yet</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Message
                  </label>
                  <textarea
                    id="message"
                    rows={4}
                    value={form.message}
                    onChange={update('message')}
                    placeholder="Tell us about your lab and what you're looking for..."
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-lab-teal/50 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {status === 'loading' ? 'Sending...' : 'Send Message'}
                </button>

                {status === 'error' && (
                  <p className="text-sm text-red-500 text-center">Something went wrong. Please try again or email info@lims.bot directly.</p>
                )}
              </form>
            )}
          </div>
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
