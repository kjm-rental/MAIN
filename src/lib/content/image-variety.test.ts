import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { editorialImages } from "./editorial-images";
import { destinations } from "./destinations";
describe("editorial image source variety", () => {
  it("uses distinct local scenery illustrations for each editorial placement", () => {
    const images = Object.values(editorialImages);
    expect(new Set(images.map((i) => i.src)).size).toBe(images.length);
    for (const i of images) {
      expect(existsSync("public" + i.src)).toBe(true);
      expect(i.alt).toContain("Illustrative scenery");
    }
    const paths = [
      ...images.map((i) => i.src),
      ...destinations.map((d) => d.image.src),
      "/images/island/cebu-coastal-ride-v2.webp",
    ];
    expect(new Set(paths).size).toBe(paths.length);
  });
  it("reserves the coastal riding image for the hero and Tops for its destination card", () => {
    for (const file of [
      "src/components/website/home-sections.tsx",
      "src/app/(website)/how-it-works/page.tsx",
      "src/app/(website)/explore-cebu/page.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain(
        'src="/images/island/cebu-coastal-ride-v2.webp"',
      );
      expect(source).not.toContain('src="/images/destinations/tops.webp"');
    }
    expect(readFileSync("src/components/website/hero.tsx", "utf8")).toContain(
      'src="/images/island/cebu-coastal-ride-v2.webp"',
    );
  });
});
