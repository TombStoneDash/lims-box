import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LIMS BOX — Commercial | Right-Sized Lab Management for Regulated Labs',
  description: 'Watch the LIMS BOX commercial. Enterprise-grade traceability without the enterprise overhead. Apply for the early-adopter pilot program for regulated labs.',
  alternates: { canonical: '/commercial' },
  openGraph: {
    title: 'LIMS BOX — Commercial',
    description: 'Enterprise-grade traceability without the enterprise overhead. Apply for the early-adopter program.',
    url: 'https://lims.bot/commercial',
  },
};

export default function CommercialLayout({ children }: { children: React.ReactNode }) {
  return children;
}
