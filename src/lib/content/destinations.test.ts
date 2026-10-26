import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import {
  destinations,
  destinationGroups,
  destinationMapUrl,
} from "./destinations";
describe("destination guide", () => {
  it("contains six distinct destinations in the three requested areas", () => {
    expect(destinations).toHaveLength(6);
    expect(new Set(destinations.map((d) => d.id)).size).toBe(6);
    expect(
      destinationGroups.every((g) =>
        destinations.some((d) => d.group === g.id),
      ),
    ).toBe(true);
  });
  it("uses six distinct local illustrations with explicit illustration disclosure", () => {
    const photos = destinations.flatMap((d) => (d.image ? [d.image] : []));
    expect(new Set(photos.map((p) => p.src)).size).toBe(6);
    for (const photo of photos) {
      expect(existsSync("public" + photo.src)).toBe(true);
      expect(photo.src).toMatch(/-ai\.webp$/);
      expect(photo.alt).toContain("Illustrative scenery");
      expect(photo.alt).toContain("not ");
    }
  });
  it("provides HTTPS sources and maps for the exact named locations", () => {
    for (const d of destinations) {
      expect(new URL(d.source).protocol).toBe("https:");
      const map = new URL(destinationMapUrl(d));
      expect(map.hostname).toBe("www.google.com");
      expect(map.searchParams.get("query")).toContain(d.name);
      expect(map.searchParams.get("query")).toContain(d.location);
      expect(d.note).toBeTruthy();
    }
  });
});
