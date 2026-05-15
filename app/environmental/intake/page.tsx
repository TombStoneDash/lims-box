import type { Metadata } from "next";
import IntakeForm from "../../_intake/IntakeForm";

export const metadata: Metadata = {
  title: "Tell us about your environmental lab — LIMS BOX",
  description: "A short intake form for environmental labs. HT reads each one personally.",
};

const ENVIRONMENTAL_ACCREDITATIONS = [
  "NELAP",
  "ELAP",
  "ISO 17025",
  "EPA",
  "State",
  "Other",
];

export default function EnvironmentalIntakePage() {
  return (
    <IntakeForm
      track="environmental"
      accent="emerald"
      title="Tell us about your environmental lab"
      subtitle="Short form. HT replies within 48 hours from hudtaylor@gmail.com."
      accreditations={ENVIRONMENTAL_ACCREDITATIONS}
      showFieldBench={true}
    />
  );
}
