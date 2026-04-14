import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Early-Adopter Program — THE LIMS BOX | Structured Pilot for Regulated Labs',
  description: 'Apply for the LIMS BOX early-adopter pilot. 5 slots for regulated labs. Dedicated onboarding, direct engineering access, founding-member pricing. Not a free trial.',
  alternates: { canonical: '/early-adopter' },
  openGraph: {
    title: 'LIMS BOX Early-Adopter Program',
    description: 'Structured pilot for regulated labs. 5 slots. Dedicated onboarding, founding-member pricing.',
    url: 'https://lims.bot/early-adopter',
  },
};

export default function EarlyAdopterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
