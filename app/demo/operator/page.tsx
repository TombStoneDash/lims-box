import type { Metadata } from "next";
import DemoOperatorSandbox from "./demo-operator-sandbox";

export const metadata: Metadata = {
  title: "Protected Synthetic Demo Operator — LIMS BOX",
  description: "Authenticated, browser-local synthetic workflow rehearsal.",
  robots: { index: false, follow: false },
};

export default function DemoOperatorPage() {
  return <DemoOperatorSandbox />;
}
