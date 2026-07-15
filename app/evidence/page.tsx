import Link from 'next/link';
import { FlaskConical, ShieldCheck, FlaskConical as FlaskIcon, Map, Ban, ArrowRight } from 'lucide-react';
import { WaitlistFooter } from '@/components/WaitlistFooter';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Capability Evidence Matrix — LIMS BOX',
  description: 'A plain-language record of what LIMS BOX has verified, demonstrated, has on its roadmap, and will not publicly claim — kept current as the product and its public proof evolve.',
  alternates: { canonical: '/evidence' },
  openGraph: {
    title: 'Capability Evidence Matrix — LIMS BOX',
    description: 'What LIMS BOX has verified, demonstrated, has on its roadmap, and will not publicly claim.',
    url: 'https://lims.bot/evidence',
  },
};

interface Row {
  claim: string;
  detail: string;
}

const verified: Row[] = [
  {
    claim: 'SENAITE is open source and publicly available',
    detail: 'GPL-licensed, full source on GitHub. Anyone can audit the code LIMS BOX runs on.',
  },
  {
    claim: "SENAITE's provenance",
    detail: 'Created by RidingBytes GmbH (Bonn, Germany), founded by Ramon Bartl and Lukas Graf — a public fact about the open-source project, not a claim of an active relationship between RidingBytes and LIMS BOX.',
  },
  {
    claim: 'Hosting infrastructure holds SOC 2 Type II attestation',
    detail: "LIMS BOX runs on cloud infrastructure that maintains SOC 2 Type II attestation — a claim about the infrastructure provider, not a certification LIMS BOX itself holds.",
  },
  {
    claim: "Founder background",
    detail: 'Hudson (Hud) Taylor — MS Biochemistry (UCSD / Salk Institute), Certified Water Specialist (California), prior senior LIMS development role at the State of Alaska Department of Health public health lab. See /about.',
  },
];

const demonstrated: Row[] = [
  {
    claim: 'Personnel Pack admin UI',
    detail: 'Personnel list, competency status, and person-detail views (competency, training, sign-offs, procedure authorizations) — captured from a local seeded fictional demo, no real lab data. See /personnel-pack.',
  },
  {
    claim: 'Survey-Ready Export',
    detail: 'ZIP export (index + one PDF per person) and a standalone PDF export, verified working end-to-end against local fictional seed data.',
  },
  {
    claim: 'SENAITE chat-to-write voice integration',
    detail: 'A voice-command interface that writes to a SENAITE instance, demonstrated in a local, offline Docker-based SENAITE environment for the Pelican-case hardware deployment — a separate system from the public lims.bot website chat widget below.',
  },
  {
    claim: 'Public website chat (LIMS BOT)',
    detail: "Grounded, citation-backed FAQ answering only. Automated tests enforce that it never fabricates an answer, never writes data, and never emits a locked forbidden compliance phrase (see tests/bot/engine.test.ts).",
  },
];

const proposed: Row[] = [
  {
    claim: 'Sample tracking & chain of custody module',
    detail: 'On the roadmap — not yet shipped as a standalone module.',
  },
  {
    claim: 'Configurable result pipeline',
    detail: 'Instrument → QA → release → archive workflows that labs can define themselves. Roadmap item.',
  },
  {
    claim: 'Native instrument integrations',
    detail: 'Direct connections to common platforms (e.g. Roche, Abbott) beyond today\'s CSV/XML file-based import. Roadmap item.',
  },
  {
    claim: 'Mobile check-ins',
    detail: 'Staff certifications, sample receipt, and training sign-offs from a phone. Roadmap item.',
  },
];

const notClaimable: Row[] = [
  {
    claim: 'Active technical collaboration with SENAITE\'s founder',
    detail: 'Previously stated on the homepage and partners page. No current authorization or evidence supports an active collaboration with Ramon Bartl — removed.',
  },
  {
    claim: '"Clear Creek Environmental Testing" case study',
    detail: 'A named customer case study with attributed testimonials (Rachel Moreno, David Park) that was not a real, approved customer. The page is now explicitly labeled a hypothetical, illustrative scenario with no company name and no attributed quotes.',
  },
  {
    claim: 'Generic-attributed customer testimonials',
    detail: 'Pain-point quotes attributed to unnamed roles ("Environmental Lab Manager," "Lab Quality Coordinator") on the environmental and clinical pages read as real customer quotes. Reframed as explicitly illustrative — not attributed quotes.',
  },
  {
    claim: 'An active, currently-running pilot cohort',
    detail: 'No enrolled, verified pilot customers exist yet. Site copy now describes the 5-lab early-adopter pilot as opening/recruiting, not already running.',
  },
  {
    claim: 'Formal partnership or consulting relationship with RidingBytes',
    detail: '"Technical consultation," "we contribute upstream," and "backed by the people who built the LIMS engine" implied an active, endorsed relationship beyond using their open-source software. Removed.',
  },
  {
    claim: 'Unqualified "compliant / certified" badges for the software itself',
    detail: 'CLIA §493.1407, 40 CFR Part 136, ISO 15189 §6.2.4, and 21 CFR Part 11 certify labs and personnel, not software. Site copy now uses "designed for / built for / ready" language instead of "compliant."',
  },
  {
    claim: 'Specific historical usage figures',
    detail: 'A blog post cited a precise beta customer count and a sweeping "every lab we talked to" claim that can\'t be substantiated. Softened to general, non-specific framing.',
  },
];

function Section({
  icon: Icon,
  title,
  intro,
  rows,
  accent,
}: {
  icon: typeof ShieldCheck;
  title: string;
  intro: string;
  rows: Row[];
  accent: string;
}) {
  return (
    <section className="px-4 pb-14">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`w-5 h-5 ${accent}`} />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-5 max-w-2xl">{intro}</p>
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.claim}
              className="bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl p-5"
            >
              <p className="font-semibold text-slate-900 dark:text-white text-sm mb-1">{row.claim}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{row.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function EvidencePage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0F172A]">
      <header className="bg-white/80 dark:bg-black/80 backdrop-blur-sm border-b border-black/5 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-lab-teal" />
              <span className="text-xl font-bold text-slate-900 dark:text-white">LIMS BOX</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <Link href="/about" className="hover:text-lab-teal transition-colors">About</Link>
              <Link href="/compliance" className="hover:text-lab-teal transition-colors">Compliance</Link>
              <Link href="/contact" className="hover:text-lab-teal transition-colors">Contact</Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="relative h-1 w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-lab-blue via-lab-teal via-lab-green to-lab-blue animate-gradient" />
      </div>

      {/* Hero */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-sm font-medium text-lab-teal uppercase tracking-wider mb-4">Capability Evidence Matrix</div>
          <h1 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-6 tracking-tight leading-tight">
            What we can prove, what we&apos;ve shown, and what we won&apos;t claim
          </h1>
          <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
            A commercial-proof cleanup found a few public claims about LIMS BOX that weren&apos;t backed by evidence —
            including a fabricated customer case study. This page is the record of what was found, what changed, and
            an ongoing, plain-language account of what we can actually stand behind. It will be kept current as the
            product and its public proof evolve.
          </p>
        </div>
      </section>

      <Section
        icon={ShieldCheck}
        title="Verified"
        intro="Independently checkable facts — about the open-source technology, hosting, and founder background — not claims about customer relationships."
        rows={verified}
        accent="text-lab-teal"
      />

      <Section
        icon={FlaskIcon}
        title="Demonstrated"
        intro="Working capability, shown against local or fictional seed data rather than a live paying customer."
        rows={demonstrated}
        accent="text-lab-blue"
      />

      <Section
        icon={Map}
        title="Proposed"
        intro="On the roadmap. Not yet built, and not claimed as shipped anywhere on the site."
        rows={proposed}
        accent="text-slate-500"
      />

      <Section
        icon={Ban}
        title="Not Publicly Claimable"
        intro="Claims that were live on the site and have been removed or reframed. Kept here as a durable record so they don't quietly reappear."
        rows={notClaimable}
        accent="text-red-500"
      />

      {/* CTA */}
      <section className="px-4 pb-16">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
            Questions about any claim on this page or elsewhere on the site — email us directly.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 bg-lab-teal hover:bg-lab-teal/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Contact Us
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <WaitlistFooter />
    </div>
  );
}
