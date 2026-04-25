import Link from 'next/link';
import type { Metadata } from 'next';
import {
  FlaskConical, MapPin, Calendar, Clock, QrCode,
  Users, Shield, Wrench, ArrowRight, CheckCircle2,
  ClipboardCheck, FileText, Microscope, BadgeCheck,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Meet LIMS BOX at COLA Forum Nashville — May 6–8, 2026',
  description:
    'See a live SENAITE-powered LIMS demo and apply to the early-adopter pilot at COLA Forum Nashville, May 6–8, 2026. Book a 15-minute meeting with the founder.',
  alternates: { canonical: '/cola' },
  openGraph: {
    title: 'Meet LIMS BOX at COLA Forum Nashville — May 6–8, 2026',
    description:
      'Live demo, early-adopter program, and 15-minute founder meetings at COLA Forum Nashville.',
    url: 'https://lims.bot/cola',
  },
};

const CALENDLY_BASE =
  process.env.NEXT_PUBLIC_CALENDLY_URL || 'https://calendly.com/hudtaylor/cola-nashville';
// utm_source=cola2026 is scoped to /cola — homepage links do not carry it.
const CALENDLY_URL = `${CALENDLY_BASE}${CALENDLY_BASE.includes('?') ? '&' : '?'}utm_source=cola2026`;
const EARLY_ADOPTER_URL = 'https://lims.bot/early-adopter';
const QR_SRC = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&ecc=M&data=${encodeURIComponent(
  EARLY_ADOPTER_URL,
)}`;

const agenda = [
  { icon: FlaskConical, label: 'Live SENAITE-powered demo — sample login, COC, e-sign, QC' },
  { icon: Shield, label: 'Audit-readiness walkthrough for CLIA & ISO 17025 labs' },
  { icon: Wrench, label: 'Talk through your workflows with the founding engineer' },
  { icon: Users, label: 'Early-adopter pilot — 5 slots, founding-member pricing' },
];

export default function ColaPage() {
  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Event',
            name: 'LIMS BOX at COLA Forum 2026',
            description:
              'Meet the LIMS BOX team at COLA Forum Nashville — live SENAITE demo, early-adopter pilot applications, and 15-minute founder meetings.',
            startDate: '2026-05-06',
            endDate: '2026-05-08',
            eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
            eventStatus: 'https://schema.org/EventScheduled',
            location: {
              '@type': 'Place',
              name: 'Gaylord Opryland Resort & Convention Center',
              address: {
                '@type': 'PostalAddress',
                addressLocality: 'Nashville',
                addressRegion: 'TN',
                addressCountry: 'US',
              },
            },
            organizer: { '@type': 'Organization', name: 'LIMS BOX', url: 'https://lims.bot' },
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
              <Link href="/compare" className="hover:text-white transition-colors">Compare</Link>
              <Link href="/early-adopter" className="hover:text-white transition-colors">Early Adopter</Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-12 md:py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#2E8B57]/20 text-[#2E8B57] text-sm font-medium px-3 py-1 rounded-full mb-6 border border-[#2E8B57]/30">
            <Calendar className="w-4 h-4" /> COLA Forum 2026
          </div>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-5">
            Visit us at COLA Forum Nashville
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-8">
            May 6–8, 2026 · Gaylord Opryland · Booth details on the COLA attendee app.
            Live SENAITE demo, early-adopter applications, and 15-minute founder meetings.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={CALENDLY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-[#2E8B57] hover:bg-[#2E8B57]/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Schedule 15 min with us
              <ArrowRight className="w-4 h-4" />
            </a>
            <Link
              href="/early-adopter"
              className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold px-6 py-3 rounded-lg border border-white/10 transition-colors"
            >
              Apply to the pilot
            </Link>
          </div>
        </div>
      </section>

      {/* Built for the labs COLA accredits */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto bg-white/5 border border-white/10 rounded-2xl p-6 md:p-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#2E8B57] uppercase tracking-wider mb-3">
              <BadgeCheck className="w-4 h-4" /> Why we're at COLA Forum
            </div>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-4">
              Built for the labs COLA accredits
            </h2>
            <p className="text-slate-300 max-w-2xl mx-auto">
              CLIA-waived clinics, physician office labs, and small reference labs don't need
              an enterprise LIMS — and most can't run one. LIMS BOX is sized to the labs
              COLA actually accredits: small staff, real workflows, real inspections.
            </p>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <li className="flex items-start gap-3 bg-black/20 border border-white/5 rounded-xl p-5">
              <div className="w-9 h-9 rounded-lg bg-[#2E8B57]/15 flex items-center justify-center flex-shrink-0">
                <ClipboardCheck className="w-4 h-4 text-[#2E8B57]" />
              </div>
              <div>
                <p className="font-semibold mb-1">CLIA &amp; COLA inspection-ready</p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Every action timestamped and attributed. Audit trail exports for the
                  inspector before they finish their coffee.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 bg-black/20 border border-white/5 rounded-xl p-5">
              <div className="w-9 h-9 rounded-lg bg-[#2E8B57]/15 flex items-center justify-center flex-shrink-0">
                <Microscope className="w-4 h-4 text-[#2E8B57]" />
              </div>
              <div>
                <p className="font-semibold mb-1">Sized for the lab, not the enterprise</p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Designed for labs under 50 people. No six-figure implementations,
                  no full-time admin to keep it running.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 bg-black/20 border border-white/5 rounded-xl p-5">
              <div className="w-9 h-9 rounded-lg bg-[#2E8B57]/15 flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-[#2E8B57]" />
              </div>
              <div>
                <p className="font-semibold mb-1">Offline when the internet isn't</p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Sample login, QC, and chain-of-custody keep working through outages,
                  bad hospital VPNs, and surprise IT patches.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 bg-black/20 border border-white/5 rounded-xl p-5">
              <div className="w-9 h-9 rounded-lg bg-[#2E8B57]/15 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-[#2E8B57]" />
              </div>
              <div>
                <p className="font-semibold mb-1">21 CFR Part 11 &amp; ISO 17025 compatible</p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  E-signatures, controlled changes, and traceable records — without
                  hiring a quality consultant to turn them on.
                </p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      {/* Event details + QR */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8">
            <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#2E8B57]" /> Event details
            </h2>
            <dl className="space-y-4 text-sm">
              <div className="flex gap-3">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-slate-400">Dates</dt>
                  <dd className="text-white font-medium">Wednesday May 6 – Friday May 8, 2026</dd>
                </div>
              </div>
              <div className="flex gap-3">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-slate-400">Venue</dt>
                  <dd className="text-white font-medium">
                    Gaylord Opryland Resort &amp; Convention Center<br />
                    <span className="text-slate-300 font-normal">2800 Opryland Dr, Nashville, TN 37214</span>
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Clock className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-slate-400">Exhibit hall hours</dt>
                  <dd className="text-white font-medium">
                    Wed 5:00–7:00 PM · Thu 7:30 AM–4:30 PM · Fri 7:30 AM–12:00 PM
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Users className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <dt className="text-slate-400">Who you'll meet</dt>
                  <dd className="text-white font-medium">
                    Hudson Taylor — founder &amp; engineer
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 flex flex-col items-center text-center">
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-[#2E8B57]" /> Apply from your phone
            </h2>
            <p className="text-sm text-slate-400 mb-5">
              Scan to open the early-adopter application.
            </p>
            <div className="bg-white rounded-xl p-4 mb-4">
              <img
                src={QR_SRC}
                alt={`QR code linking to ${EARLY_ADOPTER_URL}`}
                width={240}
                height={240}
                loading="lazy"
                className="block"
              />
            </div>
            <a
              href={EARLY_ADOPTER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-white transition-colors break-all"
            >
              {EARLY_ADOPTER_URL}
            </a>
          </div>
        </div>
      </section>

      {/* Agenda */}
      <section className="px-4 pb-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl md:text-2xl font-bold text-center mb-8">
            What we're showing at the booth
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agenda.map(item => (
              <li
                key={item.label}
                className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-4"
              >
                <div className="w-9 h-9 rounded-lg bg-[#2E8B57]/15 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-4 h-4 text-[#2E8B57]" />
                </div>
                <p className="text-sm text-slate-200 leading-relaxed pt-1.5">{item.label}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Calendly embed */}
      <section className="px-4 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#2E8B57]" /> Book 15 minutes in Nashville
              </h2>
              <a
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#2E8B57] hover:underline inline-flex items-center gap-1"
              >
                Open in Calendly <ArrowRight className="w-3 h-3" />
              </a>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/10 bg-white">
              <iframe
                src={`${CALENDLY_URL}&hide_gdpr_banner=1&background_color=ffffff&text_color=0f172a&primary_color=2e8b57`}
                title="Schedule 15 minutes with LIMS BOX at COLA Forum"
                loading="lazy"
                className="w-full h-[720px]"
              />
            </div>
            <p className="text-xs text-slate-500 mt-3 text-center">
              Can&apos;t pick a time now? Email <a className="hover:underline" href="mailto:info@lims.bot">info@lims.bot</a> and
              we&apos;ll work it out on-site.
            </p>
          </div>
        </div>
      </section>

      {/* CTA footer */}
      <section className="px-4 pb-16">
        <div className="max-w-3xl mx-auto bg-gradient-to-br from-[#2E8B57]/20 to-[#2E8B57]/5 border border-[#2E8B57]/30 rounded-2xl p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-[#2E8B57] mx-auto mb-3" />
          <h2 className="text-xl md:text-2xl font-bold mb-2">
            Can&apos;t make it to Nashville?
          </h2>
          <p className="text-slate-300 mb-6">
            The early-adopter application is open online — we review every submission personally.
          </p>
          <Link
            href="/early-adopter"
            className="inline-flex items-center gap-2 bg-[#2E8B57] hover:bg-[#2E8B57]/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Apply online <ArrowRight className="w-4 h-4" />
          </Link>
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
