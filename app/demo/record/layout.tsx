import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LIMS BOX — Screen Recording Mode',
  description: 'Recording-optimized LIMS BOX walkthrough for QuickTime screen capture. No chrome, clean transitions, timer overlay.',
  robots: { index: false, follow: false },
};

export default function RecordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
