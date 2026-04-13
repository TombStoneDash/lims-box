'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FlaskConical, ChevronDown } from 'lucide-react';
import { WaitlistFooter } from '@/components/WaitlistFooter';

interface FAQ {
  question: string;
  answer: string;
  category: string;
}

const faqs: FAQ[] = [
  {
    category: 'Getting Started',
    question: 'How long does it take to set up LIMS BOX?',
    answer: 'Most labs are operational within 5-10 business days. That includes importing your sample types, configuring analytical methods, setting up user accounts, and a training session for your team. There is no 12-18 month implementation like enterprise LIMS platforms.',
  },
  {
    category: 'Getting Started',
    question: 'Can we migrate data from our existing spreadsheets?',
    answer: 'Yes. We provide a data migration tool that imports sample records, client lists, and method configurations from Excel and CSV files. Historical data can be imported as archived records so you don\'t lose your audit trail.',
  },
  {
    category: 'Getting Started',
    question: 'Do we need dedicated IT staff to run LIMS BOX?',
    answer: 'No. LIMS BOX is designed for labs that share one IT person with the rest of the company — or don\'t have one at all. The Pelican case deployment runs on a Mac Studio that requires minimal maintenance. Cloud-hosted options require zero server management.',
  },
  {
    category: 'Pricing & Contracts',
    question: 'What does LIMS BOX cost?',
    answer: 'Plans start at $500/month for up to 3 users. The Growth plan at $1,200/month supports up to 15 users with instrument integration and advanced reporting. No implementation fee, no long-term contract, cancel anytime. See our pricing page for full details.',
  },
  {
    category: 'Pricing & Contracts',
    question: 'Is there a free trial or pilot program?',
    answer: 'We offer a 30-day pilot program for qualifying labs. You get a fully configured system with your actual methods and sample types, dedicated onboarding support, and the option to walk away with no obligation if it doesn\'t fit.',
  },
  {
    category: 'Pricing & Contracts',
    question: 'What happens to our data if we cancel?',
    answer: 'Your data is always yours. On cancellation, we provide a full export of all sample records, results, QC data, and audit trails in standard formats (CSV, JSON, PDF). We retain backups for 90 days after cancellation, then permanently delete.',
  },
  {
    category: 'Compliance',
    question: 'Is LIMS BOX ISO 17025 compliant?',
    answer: 'LIMS BOX provides the technical controls that ISO 17025 requires: audit trails, sample traceability, QC enforcement, document control, and analyst competency tracking. Your lab still needs a quality management system and documented procedures, but the software infrastructure is ready for accreditation.',
  },
  {
    category: 'Compliance',
    question: 'Does LIMS BOX meet 21 CFR Part 11 requirements?',
    answer: 'Yes. Immutable audit trails, electronic signatures with password authentication, role-based access controls, and data integrity enforcement (ALCOA+) are built into the system. We also provide validation documentation templates to support your IQ/OQ/PQ effort.',
  },
  {
    category: 'Compliance',
    question: 'How does LIMS BOX handle chain of custody?',
    answer: 'Digital chain of custody from sample receipt through disposal. Every custody transfer is signed electronically with a timestamp and user ID. Temperature logging at receipt, barcode scanning for sample login, and a complete audit trail for every handoff. The record is generated automatically — no paper forms to lose.',
  },
  {
    category: 'Technical',
    question: 'What methods does LIMS BOX support out of the box?',
    answer: 'Pre-configured templates for common EPA methods including 200.8 (metals by ICP-MS), 524.2 (VOCs by GC-MS), 300.0 (anions by IC), 365.1 (phosphorus), SM 9223B (Colilert), and more. Custom methods can be configured by your lab manager without vendor assistance.',
  },
  {
    category: 'Technical',
    question: 'Can LIMS BOX integrate with our instruments?',
    answer: 'Yes. LIMS BOX supports direct instrument integration via CSV, XML, and common data formats. ICP-MS, GC-MS, IC, UV-Vis, and other instruments that export data files can be connected. The Growth and Enterprise plans include instrument integration setup.',
  },
  {
    category: 'Technical',
    question: 'Does LIMS BOX work offline?',
    answer: 'The Pelican case deployment runs entirely on local hardware — a Mac Studio inside a ruggedized case. No internet required for core LIMS operations. This is critical for rural labs, field deployments, and facilities with unreliable connectivity. Cloud sync happens when connectivity is available.',
  },
  {
    category: 'Technical',
    question: 'What is SENAITE and why does LIMS BOX use it?',
    answer: 'SENAITE is an open-source, enterprise-grade LIMS built by RidingBytes in Germany. It powers accredited labs worldwide and is the most capable open-source LIMS available. LIMS BOX packages SENAITE into a turnkey deployment with pre-configured environmental testing workflows, simplified onboarding, and the voice interface.',
  },
  {
    category: 'Support',
    question: 'What kind of support is included?',
    answer: 'Starter plan: email support with next-business-day response. Growth plan: priority email and phone support, dedicated onboarding specialist, and quarterly check-in calls. Enterprise: dedicated account manager, SLA with 4-hour response time, on-site training available.',
  },
  {
    category: 'Support',
    question: 'Can we talk to a real person before buying?',
    answer: 'Absolutely. Schedule a live demo webinar or request a 1-on-1 call. Our founder has 15 years of LIMS implementation experience and personally handles early adopter consultations. Email info@lims.bot or call (760) 960-4273.',
  },
];

const categories = [...new Set(faqs.map((f) => f.category))];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: f.answer,
    },
  })),
};

function FAQItem({ faq }: { faq: FAQ }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-black/5 dark:border-white/5">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between py-5 text-left"
      >
        <span className="font-medium text-slate-900 dark:text-white pr-4 text-sm">{faq.question}</span>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="pb-5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {faq.answer}
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

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
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight text-center">
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 text-center mb-12">
            The questions small labs actually ask before choosing a LIMS.
          </p>

          {categories.map((cat) => (
            <div key={cat} className="mb-10">
              <h2 className="text-xs font-semibold text-lab-teal uppercase tracking-wider mb-4">
                {cat}
              </h2>
              <div className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl px-6">
                {faqs
                  .filter((f) => f.category === cat)
                  .map((faq) => (
                    <FAQItem key={faq.question} faq={faq} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <WaitlistFooter />
    </div>
  );
}
