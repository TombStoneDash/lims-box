import Link from 'next/link';
import type { Metadata } from 'next';
import {
  FlaskConical, CheckCircle2, XCircle, Minus,
  Zap, DollarSign, WifiOff, Package, Sparkles, ArrowRight,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'LIMS BOX vs Crelio, CloudLIMS, QBench & Enterprise LIMS — Compare',
  description:
    'Side-by-side comparison of LIMS BOX and the leading cloud and enterprise LIMS platforms — year-one cost, go-live time, offline capability, portability, and AI query support.',
  alternates: { canonical: '/compare' },
  openGraph: {
    title: 'Compare LIMS BOX vs Crelio, CloudLIMS, QBench, Enterprise LIMS',
    description:
      'Year-one cost, go-live time, offline capability, portability, and AI query — side-by-side.',
    url: 'https://lims.bot/compare',
  },
};

type Cell = string | { value: string; tone: 'yes' | 'no' | 'partial' };

type Row = {
  label: string;
  icon: React.ElementType;
  cells: Cell[];
};

const columns = [
  { name: 'LIMS BOX', tagline: 'Small lab, portable, AI-native', highlight: true },
  { name: 'Crelio', tagline: 'Cloud clinical LIMS' },
  { name: 'CloudLIMS', tagline: 'Cloud LIMS for SMB labs' },
  { name: 'QBench', tagline: 'Cloud LIMS, mid-market' },
  { name: 'Enterprise LIMS', tagline: 'LabWare / STARLIMS / LabVantage' },
];

const rows: Row[] = [
  {
    label: 'Year 1 cost',
    icon: DollarSign,
    cells: [
      { value: '$6,000', tone: 'yes' },
      { value: '$12,000–$24,000', tone: 'partial' },
      { value: '$15,000–$30,000', tone: 'partial' },
      { value: '$24,000–$60,000', tone: 'no' },
      { value: '$150,000+', tone: 'no' },
    ],
  },
  {
    label: 'Go-live time',
    icon: Zap,
    cells: [
      { value: 'Days', tone: 'yes' },
      { value: '4–8 weeks', tone: 'partial' },
      { value: '4–12 weeks', tone: 'partial' },
      { value: '8–16 weeks', tone: 'no' },
      { value: '6–18 months', tone: 'no' },
    ],
  },
  {
    label: 'Offline capable',
    icon: WifiOff,
    cells: [
      { value: 'Yes — local-first', tone: 'yes' },
      { value: 'No', tone: 'no' },
      { value: 'No', tone: 'no' },
      { value: 'No', tone: 'no' },
      { value: 'Partial — on-prem deploy', tone: 'partial' },
    ],
  },
  {
    label: 'Portable',
    icon: Package,
    cells: [
      { value: 'Yes — ships on a box', tone: 'yes' },
      { value: 'No', tone: 'no' },
      { value: 'No', tone: 'no' },
      { value: 'No', tone: 'no' },
      { value: 'No', tone: 'no' },
    ],
  },
  {
    label: 'AI query',
    icon: Sparkles,
    cells: [
      { value: 'Built-in, voice + text', tone: 'yes' },
      { value: 'No', tone: 'no' },
      { value: 'No', tone: 'no' },
      { value: 'Limited', tone: 'partial' },
      { value: 'Add-on, per-seat', tone: 'partial' },
    ],
  },
];

function toneClasses(tone: 'yes' | 'no' | 'partial') {
  if (tone === 'yes') return 'text-emerald-400';
  if (tone === 'no') return 'text-slate-500';
  return 'text-amber-400';
}

function ToneIcon({ tone }: { tone: 'yes' | 'no' | 'partial' }) {
  if (tone === 'yes') return <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
  if (tone === 'no') return <XCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />;
  return <Minus className="w-4 h-4 text-amber-400 flex-shrink-0" />;
}

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://lims.bot' },
              { '@type': 'ListItem', position: 2, name: 'Compare', item: 'https://lims.bot/compare' },
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
              <span className="text-xl font-bold">THE LIMS BOX</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-400">
              <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link href="/demo" className="hover:text-white transition-colors">Demo</Link>
              <Link href="/cola" className="hover:text-white transition-colors">COLA Forum</Link>
              <Link href="/early-adopter" className="hover:text-white transition-colors">Early Adopter</Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-12 md:py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            LIMS BOX vs the rest
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            A side-by-side of what you actually pay, how long you wait, and whether
            the system keeps running when your internet or vendor doesn&apos;t.
          </p>
        </div>
      </section>

      {/* Comparison table — desktop */}
      <section className="px-4 pb-10 hidden md:block">
        <div className="max-w-6xl mx-auto overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-[#0F172A] text-left py-4 pr-4 font-semibold text-slate-400 text-xs uppercase tracking-wider">
                  Capability
                </th>
                {columns.map(col => (
                  <th
                    key={col.name}
                    className={`py-4 px-4 text-left align-bottom ${
                      col.highlight
                        ? 'bg-[#2E8B57]/15 border-x border-t border-[#2E8B57]/40 rounded-t-xl'
                        : ''
                    }`}
                  >
                    <div className={`font-bold text-base ${col.highlight ? 'text-white' : 'text-slate-200'}`}>
                      {col.name}
                    </div>
                    <div className="text-xs text-slate-400 font-normal mt-0.5">{col.tagline}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={row.label}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[#0F172A] text-left py-4 pr-4 align-top border-t border-white/10"
                  >
                    <div className="flex items-center gap-2">
                      <row.icon className="w-4 h-4 text-[#2E8B57]" />
                      <span className="font-medium text-slate-200">{row.label}</span>
                    </div>
                  </th>
                  {row.cells.map((cell, cIdx) => {
                    const col = columns[cIdx];
                    const isLast = rIdx === rows.length - 1;
                    const baseBorder = 'border-t border-white/10';
                    const highlightBorder = col.highlight
                      ? `border-x border-[#2E8B57]/40 bg-[#2E8B57]/10 ${isLast ? 'rounded-b-xl border-b' : ''}`
                      : '';
                    const classes = `py-4 px-4 align-top ${baseBorder} ${highlightBorder}`;
                    if (typeof cell === 'string') {
                      return (
                        <td key={cIdx} className={classes}>
                          <span className="text-slate-300">{cell}</span>
                        </td>
                      );
                    }
                    return (
                      <td key={cIdx} className={classes}>
                        <div className="flex items-start gap-2">
                          <ToneIcon tone={cell.tone} />
                          <span className={`font-medium ${toneClasses(cell.tone)}`}>{cell.value}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Comparison cards — mobile */}
      <section className="px-4 pb-10 md:hidden">
        <div className="max-w-2xl mx-auto space-y-4">
          {columns.map((col, cIdx) => (
            <div
              key={col.name}
              className={`rounded-2xl p-5 border ${
                col.highlight
                  ? 'bg-[#2E8B57]/15 border-[#2E8B57]/40'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold">{col.name}</h2>
                  <p className="text-xs text-slate-400">{col.tagline}</p>
                </div>
                {col.highlight && (
                  <span className="text-[10px] font-semibold text-[#2E8B57] bg-[#2E8B57]/20 border border-[#2E8B57]/30 px-2 py-1 rounded-full">
                    You are here
                  </span>
                )}
              </div>
              <dl className="space-y-3">
                {rows.map(row => {
                  const cell = row.cells[cIdx];
                  return (
                    <div key={row.label} className="flex items-start justify-between gap-3">
                      <dt className="flex items-center gap-2 text-xs text-slate-400">
                        <row.icon className="w-3.5 h-3.5 text-[#2E8B57]" />
                        {row.label}
                      </dt>
                      <dd className="text-sm text-right">
                        {typeof cell === 'string' ? (
                          <span className="text-slate-300">{cell}</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 font-medium ${toneClasses(cell.tone)}`}>
                            <ToneIcon tone={cell.tone} />
                            {cell.value}
                          </span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
      </section>

      {/* Why LIMS BOX wins */}
      <section className="px-4 pb-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl md:text-2xl font-bold text-center mb-8">
            Where LIMS BOX wins
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { icon: DollarSign, title: 'Cost', body: '90% less than enterprise. Founding-member pricing locks forever.' },
              { icon: Zap, title: 'Speed', body: 'Days to go-live. No multi-month implementation project.' },
              { icon: WifiOff, title: 'Offline', body: 'Keeps running when the internet, vendor, or hospital IT fails.' },
              { icon: Package, title: 'Portable', body: 'Ships on a physical box. Move it between sites, no redeploy.' },
            ].map(w => (
              <div key={w.title} className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="w-9 h-9 rounded-lg bg-[#2E8B57]/20 flex items-center justify-center mb-3">
                  <w.icon className="w-4 h-4 text-[#2E8B57]" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-1">{w.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footnote */}
      <section className="px-4 pb-10">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-xs text-slate-400 leading-relaxed">
            <p className="font-semibold text-slate-300 mb-2">Methodology</p>
            <p>
              Pricing and implementation figures are from publicly available sources as of
              April 2026 — vendor pricing pages, G2 / Capterra buyer reviews, and public
              RFP responses. Ranges reflect the span between low-tier SaaS plans and typical
              mid-market multi-user deployments. Enterprise LIMS figures are for LabWare,
              STARLIMS, and LabVantage combined and include implementation, validation, and
              first-year license fees for a lab of 10–30 users. Your actual quotes may vary.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-16">
        <div className="max-w-3xl mx-auto bg-gradient-to-br from-[#2E8B57]/20 to-[#2E8B57]/5 border border-[#2E8B57]/30 rounded-2xl p-8 text-center">
          <h2 className="text-xl md:text-2xl font-bold mb-2">
            See it running in your browser
          </h2>
          <p className="text-slate-300 mb-6">
            The interactive demo walks through sample login, chain of custody, and an
            EPA-ready report — in under three minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/demo"
              className="inline-flex items-center justify-center gap-2 bg-[#2E8B57] hover:bg-[#2E8B57]/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Open the live demo <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/early-adopter"
              className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold px-6 py-3 rounded-lg border border-white/10 transition-colors"
            >
              Apply to the pilot
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} THE LIMS BOX by Tombstone Dash LLC.</p>
          <div className="flex items-center gap-6">
            <a href="mailto:info@lims.bot" className="hover:text-white transition-colors">info@lims.bot</a>
            <Link href="/" className="hover:text-white transition-colors">lims.bot</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
