import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Schedule LIMS BOX Demo | Voice-Controlled Laboratory Information System',
  description:
    'See LIMS BOX in action with a synthetic interactive walkthrough plus Calendly scheduling for a live demo conversation. No customer, patient, or production data appears on this page.',
  keywords: ['LIMS demo', 'lab management demo', 'SENAITE demo', 'voice controlled LIMS', 'schedule LIMS demo', 'lab software trial'],
  alternates: { canonical: '/demo' },
  openGraph: {
    title: 'Schedule LIMS BOX Demo — Voice-Controlled Lab Management',
    description: 'Synthetic interactive walkthrough and Calendly scheduling for a live demo conversation. Built for labs evaluating LIMS BOX without exposing production data.',
    url: 'https://lims.bot/demo',
  },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
