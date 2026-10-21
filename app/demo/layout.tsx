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

const SYNTHETIC_DEMO_BANNER_TEXT =
  'Synthetic demonstration data only. Fictional labs, samples, and people; no customer, patient, or production records.';

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div
        role="note"
        data-synthetic-banner=""
        className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900"
      >
        {SYNTHETIC_DEMO_BANNER_TEXT}
      </div>
      {children}
    </>
  );
}
