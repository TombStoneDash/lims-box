import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Interactive Demo — LIMS BOX',
  description:
    'Walk through a real LIMS BOX workflow: log a drinking water sample, track chain of custody, and generate a compliance report — all in your browser.',
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
