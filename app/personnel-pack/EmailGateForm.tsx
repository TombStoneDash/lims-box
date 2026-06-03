'use client';

import React, { useState } from 'react';
import { Download } from 'lucide-react';

export function EmailGateForm() {
  const [email, setEmail] = useState('');
  const [accredType, setAccredType] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/personnel-pack-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, accredType }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || 'Something went wrong. Email info@lims.bot directly.');
      }
    } catch {
      setError('Network error. Email info@lims.bot directly.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="px-4 pb-10">
      <div className="max-w-2xl mx-auto bg-white/5 border border-[#2E8B57]/30 rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-2 mb-2">
          <Download className="w-5 h-5 text-[#2E8B57] flex-shrink-0" />
          <h2 className="text-lg font-semibold text-white">
            Get the Personnel Pack PDF — Free
          </h2>
        </div>
        <p className="text-sm text-slate-400 mb-5 leading-relaxed">
          Survey-ready templates for ISO&nbsp;15189&nbsp;§6.2 and CLIA&nbsp;§493.1407.
          Printable, no login required. Built by a lab informaticist who&apos;s been through
          the inspection.
        </p>

        {submitted ? (
          <div className="bg-[#2E8B57]/10 border border-[#2E8B57]/30 rounded-lg px-4 py-3">
            <p className="text-[#2E8B57] font-medium text-sm">
              ✓ Check your inbox — the PDF is on its way. (Check spam if it doesn&apos;t arrive
              within 2&nbsp;minutes.)
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="your@lab.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-sm
                         text-white placeholder:text-slate-500 focus:outline-none
                         focus:border-[#2E8B57]/60 w-full"
            />
            <select
              value={accredType}
              onChange={(e) => setAccredType(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-4 py-2.5 text-sm
                         text-slate-300 focus:outline-none focus:border-[#2E8B57]/60 w-full
                         appearance-none"
            >
              <option value="">Accreditation type (optional)</option>
              <option value="cola">COLA</option>
              <option value="cap">CAP</option>
              <option value="iso15189">ISO 15189 only</option>
              <option value="clia">CLIA only</option>
              <option value="other">Other / not sure</option>
            </select>
            <button
              type="submit"
              disabled={loading}
              className="bg-[#2E8B57] hover:bg-[#2E8B57]/90 disabled:opacity-60
                         text-white font-semibold px-6 py-2.5 rounded-lg text-sm
                         transition-colors flex items-center justify-center gap-2"
            >
              {loading ? 'Sending…' : 'Send me the PDF →'}
            </button>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <p className="text-xs text-slate-500">
              No phone required. No spam. Unsubscribe anytime.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
