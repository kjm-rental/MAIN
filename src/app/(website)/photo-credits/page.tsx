import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { PageHero } from "@/components/ui/page-hero";
import { destinations } from "@/lib/content/destinations";
import { editorialImages } from "@/lib/content/editorial-images";
export const metadata: Metadata = { title: "Photo credits" };
export default function PhotoCredits() {
  return (
    <main>
      <PageHero
        compact
        eyebrow="Photography"
        title="Photo credits"
        description="Credits for the island scenery used on our website."
      />
      <Container className="py-10">
        <article className="border-deep-teal/15 rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-bold">Mactan beach</h2>
          <p className="text-muted mt-3 leading-7">
            Photograph by{" "}
            <a
              className="text-ocean underline"
              href="https://commons.wikimedia.org/wiki/File:Mactan-beach.jpg"
            >
              Lsj, via Wikimedia Commons
            </a>
            . Licensed under{" "}
            <a
              className="text-ocean underline"
              href="https://creativecommons.org/licenses/by-sa/3.0/"
            >
              Creative Commons Attribution-ShareAlike 3.0
            </a>
            . Cropped for display. The photograph provides destination
            inspiration and does not depict KJM premises.
          </p>
        </article>
        {Object.values(editorialImages).map((image) => (
          <article
            key={image.id}
            id={image.id}
            className="border-deep-teal/15 mt-5 scroll-mt-32 rounded-2xl border bg-white p-6"
          >
            <h2 className="text-xl font-bold">{image.title}</h2>
            <p className="text-muted mt-3 leading-7">
              Photograph by{" "}
              <a
                className="text-ocean underline"
                href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(image.file)}`}
              >
                {image.author}, via Wikimedia Commons
              </a>
              . Licensed under{" "}
              <a
                className="text-ocean underline"
                href={`https://creativecommons.org/licenses/by-sa/${image.license}/`}
              >
                CC BY-SA {image.license}
              </a>
              . Resized, converted to WebP and cropped for display; these
              adaptations retain the same license. Historical destination
              inspiration, not KJM premises, vehicles or an endorsed riding
              route.
            </p>
          </article>
        ))}
        {destinations.map(
          (destination) =>
            destination.image && (
              <article
                key={destination.id}
                id={destination.id}
                className="border-deep-teal/15 mt-5 scroll-mt-32 rounded-2xl border bg-white p-6"
              >
                <h2 className="text-xl font-bold">{destination.name}</h2>
                <p className="text-muted mt-3 leading-7">
                  Photograph by{" "}
                  <a
                    className="text-ocean underline"
                    href={destination.image.file}
                  >
                    {destination.image.author}, via Wikimedia Commons
                  </a>
                  . Licensed under{" "}
                  <a
                    className="text-ocean underline"
                    href={`https://creativecommons.org/licenses/by-sa/${destination.image.license}/`}
                  >
                    CC BY-SA {destination.image.license}
                  </a>
                  . Resized, converted to WebP and cropped for display. These
                  image adaptations remain available under the same license.
                  Photographs are historical views, not a guarantee of current
                  venue appearance.
                </p>
              </article>
            ),
        )}
      </Container>
    </main>
  );
}
