import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LIMS BOX Walkthrough — 3-Minute Product Demo',
  description: 'Auto-guided product walkthrough: sample intake, audit trail, QC dashboard, reporting, and LIMS BOT query. See the full LIMS BOX workflow in 3 minutes.',
  alternates: { canonical: '/demo/walkthrough' },
};

export default function WalkthroughLayout({ children }: { children: React.ReactNode }) {
  return children;
}
