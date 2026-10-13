import type { Metadata } from "next";
import { MapPin, MessageCircle } from "lucide-react";
import { PageHero } from "@/components/ui/page-hero";
import { Container } from "@/components/ui/container";
export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact information placeholder for KJM Motorcycle Rental in Lapu-Lapu City, Cebu.",
};
export default function ContactPage() {
  return (
    <main>
      <PageHero
        eyebrow="Contact KJM"
        title="Let’s plan your Cebu ride"
        description="Verified phone, email, social, and operating-hour details have not yet been supplied."
      />
      <section className="bg-sand py-16 sm:py-24">
        <Container className="grid gap-6 md:grid-cols-2">
          <article className="bg-off-white border-deep-teal/10 rounded-[1.5rem] border p-8">
            <MapPin aria-hidden="true" className="text-ocean size-7" />
            <h2 className="text-deep-teal mt-6 text-2xl font-bold">Location</h2>
            <p className="text-muted mt-3 leading-7">
              Lapu-Lapu City, Mactan Island, Cebu, Philippines
            </p>
            <p className="text-muted mt-4 text-xs">
              Exact pickup location and directions are to be confirmed.
            </p>
          </article>
          <article className="bg-deep-teal rounded-[1.5rem] p-8 text-white">
            <MessageCircle aria-hidden="true" className="text-sunset size-7" />
            <h2 className="mt-6 text-2xl font-bold">
              Contact details coming soon
            </h2>
            <p className="text-on-dark-muted mt-3 leading-7">
              KJM’s approved phone number, email address, social profiles, and
              operating hours will appear here once supplied.
            </p>
          </article>
        </Container>
      </section>
    </main>
  );
}
