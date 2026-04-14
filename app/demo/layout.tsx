import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Schedule LIMS BOX Demo | Voice-Controlled Laboratory Information System',
  description:
    'See LIMS BOX in action — interactive walkthrough plus Calendly scheduling for a live pilot demo. Voice-controlled SENAITE, reduced data entry, compliance automation for lab directors.',
  keywords: ['LIMS demo', 'lab management demo', 'SENAITE demo', 'voice controlled LIMS', 'schedule LIMS demo', 'lab software trial'],
  alternates: { canonical: '/demo' },
  openGraph: {
    title: 'Schedule LIMS BOX Demo — Voice-Controlled Lab Management',
    description: 'Interactive walkthrough and Calendly scheduling for live pilot demos. Built for lab directors evaluating LIMS for environmental and water testing labs under 50 people.',
    url: 'https://lims.bot/demo',
  },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
