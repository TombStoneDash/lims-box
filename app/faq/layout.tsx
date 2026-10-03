import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FAQ — LIMS BOX',
  description:
    'Answers to the questions small labs ask before choosing a LIMS: setup time, data migration, pricing, offline operation, instruments and support.',
  alternates: { canonical: '/faq' },
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return children;
}
