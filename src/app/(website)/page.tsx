import { Hero } from "@/components/website/hero";
import { HomeSections } from "@/components/website/home-sections";
import { getPublicMotorcycleCatalog } from "@/services/public-catalog";
import motion from "@/components/website/home-motion.module.css";

export const instant = false;

export default async function HomePage() {
  const catalog = await getPublicMotorcycleCatalog();
  return (
    <main className={motion.home}>
      <Hero motorcycles={catalog.motorcycles} />
      <HomeSections catalog={catalog} />
    </main>
  );
}
