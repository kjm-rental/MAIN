import type { Metadata } from "next";

import { CatalogExplorer } from "@/components/website/catalog-explorer";
import { PageHero } from "@/components/ui/page-hero";
import { Container } from "@/components/ui/container";
import { CatalogSourceNotice } from "@/components/website/catalog-source-notice";
import { getPublicMotorcycleCatalog } from "@/services/public-catalog";

export const metadata: Metadata = {
  title: "Our Motorcycles",
  description:
    "Explore the official KJM Motorcycle Rental model catalog and daily rates.",
};

export const instant = false;

export default async function MotorcyclesPage() {
  const catalog = await getPublicMotorcycleCatalog();
  return (
    <main>
      <PageHero
        compact
        eyebrow="Official model catalog"
        title="Find a motorcycle for your Cebu plans"
        description="Compare all ten client-supplied models, exact daily prices, and manufacturer-reference specifications. Photography and live availability remain pending."
      />
      <section className="bg-sand pt-2 pb-12 sm:pt-2 sm:pb-16">
        <Container>
          <CatalogSourceNotice
            source={catalog.source}
            notice={catalog.notice}
          />
          <CatalogExplorer motorcycles={catalog.motorcycles} />
          <p className="text-muted mt-8 text-xs leading-5">
            Specifications describe manufacturer reference models, not a
            guarantee of the year or variant of any physical rental unit.
          </p>
        </Container>
      </section>
    </main>
  );
}
