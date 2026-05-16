import type { Metadata } from "next";
import IntakeForm from "../../_intake/IntakeForm";

export const metadata: Metadata = {
  title: "Tell us about your clinical lab — LIMS BOX",
  description: "A short intake form for clinical labs. HT reads each one personally.",
};

const CLINICAL_ACCREDITATIONS = [
  "CLIA",
  "CAP",
  "COLA",
  "ISO 15189",
  "Joint Commission",
  "Other",
];

export default function ClinicalIntakePage() {
  return (
    <IntakeForm
      track="clinical"
      accent="teal"
      title="Tell us about your clinical lab"
      subtitle="Short form. HT replies within 48 hours from hudtaylor@gmail.com."
      accreditations={CLINICAL_ACCREDITATIONS}
      showFieldBench={false}
    />
  );
}
