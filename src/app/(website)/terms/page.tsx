import type { Metadata } from "next";
import { TermsAgreement } from "@/components/website/terms-agreement";
import { currentTerms } from "@/lib/terms";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description:
    "KJM Motorcycle Rental Terms and Conditions, effective October 12, 2026.",
};
export default function TermsPage() {
  return <TermsAgreement terms={currentTerms} />;
}
