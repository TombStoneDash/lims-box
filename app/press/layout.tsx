import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Press Kit — THE LIMS BOX | Logos, Screenshots & Company Info',
  description: 'Download THE LIMS BOX press kit: logo SVGs, product screenshots, company boilerplate, and founder bio. For media inquiries contact info@lims.bot.',
  alternates: { canonical: '/press' },
};

export default function PressLayout({ children }: { children: React.ReactNode }) {
  return children;
}
