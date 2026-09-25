import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { FlaskConical } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Page not found | LIMS BOX',
  robots: { index: false, follow: true },
};

const links = [
  { href: '/', label: 'Home' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/demo', label: 'Demo' },
  { href: '/personnel-pack', label: 'Personnel Pack' },
  { href: '/faq', label: 'Frequently asked questions' },
  { href: '/contact', label: 'Contact' },
];

const focusStyles = 'rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lab-teal';

export default function NotFound() {
  return (
    // RootLayout wraps this page in <main id="main-content">.
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">
      <header className="bg-white/80 dark:bg-black/80 backdrop-blur-sm border-b border-black/5 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
          <Link href="/" className={`inline-flex items-center gap-2 ${focusStyles}`}>
            <FlaskConical aria-hidden="true" className="w-6 h-6 text-lab-teal" />
            <span className="text-xl font-bold text-slate-900 dark:text-white">LIMS BOX</span>
          </Link>
        </div>
      </header>

      <div aria-hidden="true" className="h-1 bg-gradient-to-r from-lab-blue via-lab-teal to-lab-green" />

      <section className="max-w-3xl mx-auto py-16 md:py-24 px-4">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
          Page not found
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-300 mb-8">
          This link may have changed or been mistyped; choose a page below to find your way.
        </p>
        <nav aria-label="Find your way">
          <ul className="space-y-3 text-slate-900 dark:text-white">
            {links.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className={`inline-block py-1 underline underline-offset-4 hover:text-lab-teal transition-colors ${focusStyles}`}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>
    </div>
  );
}
