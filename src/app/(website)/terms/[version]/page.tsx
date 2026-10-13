import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TermsAgreement } from "@/components/website/terms-agreement";
import { termsVersions } from "@/lib/terms";

export const metadata: Metadata = {
  title: "Terms and Conditions — October 12, 2026",
};
export function generateStaticParams() {
  return Object.keys(termsVersions).map((version) => ({ version }));
}
export default async function TermsVersionPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  if (!Object.hasOwn(termsVersions, version)) notFound();
  return (
    <TermsAgreement
      terms={termsVersions[version as keyof typeof termsVersions]}
    />
  );
}
