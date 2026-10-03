import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Live demos — LIMS BOX',
  description:
    'Join a live LIMS BOX walkthrough, ask questions and see whether it fits your lab.',
  alternates: { canonical: '/webinar' },
};

export default function WebinarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
