import Link from 'next/link';
import { FlaskConical, ArrowRight, Shield, FileText, Award } from 'lucide-react';

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
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white mb-6 tracking-tight">
            Lab management that fits your lab.
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-10 max-w-2xl mx-auto">
            Modern LIMS for environmental and water testing labs under 50 people.
            Sample tracking, COC management, and reporting — without the enterprise bloat.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              See the Demo
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 bg-white dark:bg-white/10 hover:bg-slate-50 dark:hover:bg-white/20 text-slate-900 dark:text-white font-semibold px-6 py-3 rounded-lg border border-slate-200 dark:border-white/10 transition-colors"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="py-8 px-4 bg-white/50 dark:bg-white/5 border-y border-black/5 dark:border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap justify-center gap-8 md:gap-12">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Award className="w-5 h-5 text-lab-teal" />
              <span className="font-medium">ISO 17025 Ready</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Shield className="w-5 h-5 text-lab-teal" />
              <span className="font-medium">21 CFR Part 11 Compatible</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <FileText className="w-5 h-5 text-lab-teal" />
              <span className="font-medium">EPA Reporting Built In</span>
            </div>
          </div>
        </div>
      </section>
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
