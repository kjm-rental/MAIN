import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { destinations } from "@/lib/content/destinations";
import { editorialImages } from "@/lib/content/editorial-images";
export const metadata: Metadata = { title: "About our images" };
export default function AboutImages() {
  return (
    <main>
      <PageHero
        compact
        eyebrow="Travel inspiration"
        title="About our images"
        description="Our scenery images are illustrations inspired by Cebu and the Philippine tropics."
      />
      <Container className="py-10">
        <p className="text-muted leading-7">
          These images are not documentary photographs of actual landmarks,
          businesses, roads or beaches. They do not depict KJM premises or
          guarantee current appearance, access or route suitability. The beach
          illustration does not depict Bluewater or any specific resort. Real
          motorcycle inventory photographs are separate from these illustrations.
        </p>
        <ul className="text-muted mt-6 space-y-3 leading-7">
          <li>Homepage riding scene — Coastal travel illustration.</li>
          <li>About page beach — Tropical beach illustration.</li>
          {Object.values(editorialImages).map((image) => (
            <li key={image.id} id={image.id} className="scroll-mt-32">
              {image.title} — Travel illustration.
            </li>
          ))}
          {destinations.map((destination) => (
            <li key={destination.id} id={destination.id} className="scroll-mt-32">
              {destination.name} guide card — Thematic illustration,
              not a depiction of the named destination.
            </li>
          ))}
        </ul>
      </Container>
    </main>
  );
}
