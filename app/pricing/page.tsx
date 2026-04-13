import Link from 'next/link';
import { FlaskConical, Check, ArrowRight, Shield, Zap, Users } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — LIMS BOX | Simple Lab Management Starting at $500/mo',
  description: 'LIMS BOX pricing for small environmental and water testing labs. Starter at $500/mo, Growth at $1,200/mo, Enterprise custom. No implementation fee. No long-term contract.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing — LIMS BOX',
    description: 'Simple, transparent pricing for small labs. Starting at $500/mo. No implementation fee. Cancel anytime.',
    url: 'https://lims.bot/pricing',
  },
};

const tiers = [
  {
    name: 'Starter',
    price: '$500',
    period: '/mo',
    description: 'For labs getting off spreadsheets and into a real LIMS.',
    icon: Zap,
    color: 'lab-teal',
    features: [
      'Up to 3 users',
      'Sample tracking & chain of custody',
      'QA/QC management',
      'Basic reporting & templates',
      '4 core modules included',
      'Email support (next business day)',
      'Cloud-hosted — no servers to manage',
      'Unlimited samples',
    ],
    cta: 'Start Your 30-Day Pilot',
    href: '/contact',
    highlighted: false,
  },
  {
    name: 'Growth',
    price: '$1,200',
    period: '/mo',
    description: 'For labs scaling up and needing the full platform.',
    icon: Users,
    color: 'lab-blue',
    features: [
      'Up to 10 users',
      'Everything in Starter, plus:',
      'All modules unlocked',
      'Automated EPA & state reporting',
      'Instrument integration',
      'Custom report templates',
      'Dedicated onboarding call',
      'Priority email & chat support',
      'Data migration assistance',
    ],
    cta: 'Start Your 30-Day Pilot',
    href: '/contact',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For multi-site labs and organizations with specific requirements.',
    icon: Shield,
    color: 'lab-sky',
    features: [
      'Unlimited users',
      'Everything in Growth, plus:',
      'API access & integrations',
      'Multi-site management',
      'Dedicated account manager',
      'Custom development & workflows',
      'On-premise deployment option',
      'SLA-backed uptime guarantee',
      'SSO / LDAP authentication',
    ],
    cta: 'Contact Sales',
    href: '/contact',
    highlighted: false,
  },
];

const faqs = [
  {
    q: 'Is there an implementation fee?',
    a: 'No. Zero implementation fees. Your subscription includes setup, configuration, and onboarding support. Growth and Enterprise plans include a dedicated onboarding call.',
  },
  {
    q: 'Do I need a long-term contract?',
    a: 'No. All plans are month-to-month. No 18-month contract. Cancel anytime — your data is always exportable.',
  },
  {
    q: 'How long does setup take?',
    a: 'Most labs are up and running within a week. Starter plan labs often go live in 2-3 days. We handle data migration for Growth and Enterprise plans.',
  },
  {
    q: 'What modules are included in Starter?',
    a: 'Starter includes the 4 core modules: Sample Tracking, Chain of Custody, QA/QC Management, and Basic Reporting. Growth unlocks all modules including instrument integration, automated regulatory reporting, and advanced analytics.',
  },
  {
    q: 'Can I upgrade or downgrade anytime?',
    a: 'Yes. Upgrade instantly, downgrade at the end of your billing cycle. No penalties either way.',
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. LIMS BOX is hosted on SOC 2 compliant infrastructure with encryption at rest and in transit. All data is backed up daily with point-in-time recovery.',
  },
];

export default function PricingPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://lims.bot' },
      { '@type': 'ListItem', position: 2, name: 'Pricing', item: 'https://lims.bot/pricing' },
    ],
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      {/* Header */}
      <header className="bg-white/80 dark:bg-black/80 backdrop-blur-sm border-b border-black/5 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-lab-teal" />
              <span className="text-xl font-bold text-slate-900 dark:text-white">LIMS BOX</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <Link href="/blog" className="hover:text-lab-teal transition-colors">Blog</Link>
              <Link href="/demo" className="hover:text-lab-teal transition-colors">Demo</Link>
              <Link href="/contact" className="hover:text-lab-teal transition-colors">Contact</Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="relative h-1 w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-lab-blue via-lab-teal via-lab-green to-lab-blue animate-gradient" />
      </div>

      {/* Hero */}
      <section className="py-16 md:py-20 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
            Simple pricing for real labs
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-300 mb-2">
            No implementation fee. No 18-month contract. Cancel anytime.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Every plan includes unlimited samples, cloud hosting, and free updates.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-16 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {tiers.map(tier => (
            <div
              key={tier.name}
              className={`relative bg-white dark:bg-white/5 rounded-2xl border overflow-hidden flex flex-col ${
                tier.highlighted
                  ? 'border-lab-teal shadow-lg shadow-lab-teal/10 ring-2 ring-lab-teal/20'
                  : 'border-black/5 dark:border-white/10'
              }`}
            >
              {tier.highlighted && (
                <div className="bg-lab-teal text-white text-center text-xs font-semibold py-1.5 uppercase tracking-wider">
                  Most Popular
                </div>
              )}
              <div className="p-6 md:p-8 flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <tier.icon className={`w-5 h-5 text-${tier.color}`} />
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">{tier.name}</h2>
                </div>
                <div className="mb-2">
                  <span className="text-4xl font-bold text-slate-900 dark:text-white">{tier.price}</span>
                  <span className="text-slate-500 dark:text-slate-400">{tier.period}</span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">{tier.description}</p>

                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map(feature => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <Check className="w-4 h-4 text-lab-teal flex-shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={tier.href}
                  className={`w-full text-center py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                    tier.highlighted
                      ? 'bg-lab-teal hover:bg-lab-teal/90 text-white'
                      : 'bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-900 dark:text-white'
                  }`}
                >
                  {tier.cta} <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust bar */}
      <section className="py-8 px-4 bg-white/50 dark:bg-white/5 border-y border-black/5 dark:border-white/5">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-8 text-sm text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-lab-teal" /> ISO 17025 Ready</span>
          <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-lab-teal" /> 21 CFR Part 11 Compatible</span>
          <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-lab-teal" /> EPA Reporting Built In</span>
          <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-lab-teal" /> SOC 2 Infrastructure</span>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-8 text-center">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {faqs.map(faq => (
              <div key={faq.q} className="bg-white dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/10 p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{faq.q}</h3>
                <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-black/5 dark:border-white/5">
        <div className="max-w-7xl mx-auto text-center text-sm text-slate-500 dark:text-slate-400">
          <p>&copy; {new Date().getFullYear()} LIMS BOX by Tombstone Dash LLC.</p>
        </div>
      </footer>
    </div>
  );
}
