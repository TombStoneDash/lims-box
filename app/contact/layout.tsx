import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact — LIMS BOX',
  description:
    'Get in touch with the LIMS BOX team. Start a 30-day pilot, ask questions, or learn how LIMS BOX fits your lab — no sales pressure.',
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
