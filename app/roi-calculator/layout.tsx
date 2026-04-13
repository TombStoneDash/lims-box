import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ROI Calculator — LIMS BOX',
  description:
    'Estimate how much time and money your lab could save by switching to LIMS BOX. Enter your sample volume, staff count, and current tools to see projected savings.',
};

export default function ROICalculatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
