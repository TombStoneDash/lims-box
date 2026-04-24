import Link from 'next/link';
import {
  FlaskConical, ArrowRight, Shield, FileText, Award, HeartPulse,
  Stethoscope, ClipboardCheck, FileCheck2, WifiOff,
} from 'lucide-react';
import { WaitlistFooter } from '@/components/WaitlistFooter';

const COLA_CALENDLY_URL =
  (process.env.NEXT_PUBLIC_CALENDLY_URL || 'https://calendly.com/hudtaylor/cola-nashville') +
  '?utm_source=cola2026';

const colaCards = [
  {
    icon: Stethoscope,
    title: 'Physician office labs & small independents',
    body: 'Not enterprise-sized pricing. Not enterprise-sized rigidity. Built for the size of lab COLA actually accredits.',
  },
  {
    icon: ClipboardCheck,
    title: 'CLIA waived, moderate, or high complexity',
    body: 'QC tracking that maps to the complexity tier you run. Levey-Jennings, Westgard, and daily QC built in — not bolted on.',
  },
  {
    icon: FileCheck2,
    title: 'Audit trail that survives an inspector',
    body: 'Every sample, every result, every override signed and timestamped. No paper logs to reconcile the night before your survey.',
  },
  {
    icon: WifiOff,
    title: 'No IT department required',
    body: 'One box, one install, one afternoon. Keeps running when your internet, your vendor, or your hospital IT drops you.',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">
      <header className="bg-white/80 dark:bg-black/80 backdrop-blur-sm border-b border-black/5 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-lab-teal" />
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
          <div className="inline-flex items-center gap-2 bg-lab-teal/10 dark:bg-lab-teal/20 text-lab-teal text-sm font-medium px-3 py-1 rounded-full mb-6 border border-lab-teal/20 dark:border-lab-teal/30">
            <Award className="w-4 h-4" /> Meet us at COLA Forum · Nashville · May 6–8
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6 tracking-tight">
            The LIMS purpose-built for COLA-accredited labs.
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-10 max-w-2xl mx-auto">
            Offline-capable. Audit-ready in minutes. Pass your next COLA inspection without spreadsheets, paper logs, or a vendor who won&apos;t return your call.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={COLA_CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Book 15 min at COLA Forum
              <ArrowRight className="w-4 h-4" />
            </a>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 bg-white dark:bg-white/10 hover:bg-slate-50 dark:hover:bg-white/20 text-slate-900 dark:text-white font-semibold px-6 py-3 rounded-lg border border-slate-200 dark:border-white/10 transition-colors"
            >
              See the Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Built for the labs COLA accredits */}
      <section className="py-16 md:py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 md:mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">
              Built for the labs COLA accredits.
            </h2>
            <p className="text-base md:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              Physician office labs. Small independents. Teams of two to twenty who run real samples — and sit across from a real inspector every two years.
            </p>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            {colaCards.map(card => (
              <li
                key={card.title}
                className="flex items-start gap-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5 md:p-6"
              >
                <div className="w-10 h-10 rounded-lg bg-lab-teal/10 dark:bg-lab-teal/15 flex items-center justify-center flex-shrink-0">
                  <card.icon className="w-5 h-5 text-lab-teal" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-semibold text-slate-900 dark:text-white mb-1.5">
                    {card.title}
                  </h3>
                  <p className="text-sm md:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                    {card.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="text-center mt-10">
            <a
              href={COLA_CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Book 15 min at COLA Forum
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
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
