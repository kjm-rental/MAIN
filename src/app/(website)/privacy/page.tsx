import type { Metadata } from "next";
import { PageHero } from "@/components/ui/page-hero";
import { Container } from "@/components/ui/container";
export const metadata: Metadata = {
  title: "Privacy — Draft",
  robots: { index: false, follow: false },
};
export default function PrivacyPage() {
  return (
    <main>
      <PageHero
        eyebrow="Draft placeholder"
        title="Privacy policy is not finalized"
        description="This privacy policy remains a draft pending KJM approval. The restricted booking flow collects customer details and private documents for manual review."
      />
      <section className="bg-sand py-16">
        <Container className="max-w-3xl">
          <div className="border-deep-teal/10 bg-off-white rounded-[1.5rem] border p-8">
            <p className="text-muted leading-7">
              Data collection purposes, lawful basis, retention, access,
              deletion, subprocessors, contact details, and local legal review
              must be confirmed before customer accounts or bookings launch.
            </p>
          </div>
        </Container>
      </section>
    </main>
  );
}
