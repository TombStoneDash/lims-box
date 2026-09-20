'use client';

import { useState } from 'react';
import { newsletterMessage, newsletterOutcome } from '@/lib/newsletter-status';

export function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | ReturnType<typeof newsletterOutcome>>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');

    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'blog_newsletter' })
      });

      const body: unknown = await res.json().catch(() => null);
      const outcome = newsletterOutcome(res.status, body);
      setStatus(outcome);
      if (outcome !== 'error') {
        setEmail('');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="bg-gradient-to-r from-[#0D9488]/10 to-[#1E40AF]/10 dark:from-[#0D9488]/5 dark:to-[#1E40AF]/5 rounded-2xl p-8 my-12">
      <div className="max-w-xl mx-auto text-center">
        <h3 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
          Get Lab Management Tips in Your Inbox
        </h3>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          Practical advice for running a small testing lab. No spam, no enterprise sales pitches.
        </p>

        {status === 'subscribed' || status === 'deferred' ? (
          <p role="status" className="text-lab-teal font-medium">{newsletterMessage(status)}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-lab-teal/50"
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="px-6 py-3 bg-lab-teal text-white font-medium rounded-lg hover:bg-lab-teal/90 transition-colors disabled:opacity-50"
            >
              {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
            </button>
          </form>
        )}

        {status === 'error' && (
          <p role="alert" className="text-red-500 text-sm mt-2">{newsletterMessage(status)}</p>
        )}
      </div>
    </div>
  );
}
