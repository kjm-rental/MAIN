import { Suspense } from "react";
import { Hero } from "@/components/website/hero";
import { HomeSections } from "@/components/website/home-sections";
import { getPublicMotorcycleCatalog } from "@/services/public-catalog";
import motion from "@/components/website/home-motion.module.css";

export const instant = false;

export default function HomePage() {
  const catalog = getPublicMotorcycleCatalog();
  return (
    <main className={motion.home}>
      <Hero catalog={catalog} />
      <Suspense
        fallback={
          <div
            role="status"
            aria-label="Loading motorcycles"
            className="bg-off-white min-h-72"
          />
        }
      >
        <LiveHomeSections catalog={catalog} />
      </Suspense>
    </main>
  );
}

async function LiveHomeSections({
  catalog,
}: {
  catalog: ReturnType<typeof getPublicMotorcycleCatalog>;
}) {
  return <HomeSections catalog={await catalog} />;
}
