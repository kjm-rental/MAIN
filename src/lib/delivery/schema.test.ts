import { expect, it } from "vitest";
import { serviceSelectionSchema } from "./schema";
const leg = {
  areaId: "10000000-0000-4000-8000-000000000001",
  address: "Hotel entrance, street 12",
  hotel: "Hotel",
  landmark: "Lobby",
  mapsUrl: "https://maps.app.goo.gl/location",
  instructions: "Call on arrival",
};
it("accepts independent delivery and collection locations without submitted prices", () => {
  const d = serviceSelectionSchema.parse({
    delivery: { ...leg, amount: 1 },
    collection: { ...leg, address: "Another hotel, street 24" },
    total: 1,
  });
  expect(d.delivery?.address).not.toBe(d.collection?.address);
  expect(d.delivery).not.toHaveProperty("amount");
  expect(d).not.toHaveProperty("total");
});
it("supports self pickup and return", () => {
  expect(serviceSelectionSchema.parse({})).toEqual({
    delivery: null,
    collection: null,
  });
});
it.each([
  "javascript:alert(1)",
  "https://evil.example/maps",
  "http://google.com/maps/a",
])("rejects unsafe map destination %s", (url) => {
  expect(
    serviceSelectionSchema.safeParse({ delivery: { ...leg, mapsUrl: url } })
      .success,
  ).toBe(false);
});
it("requires an area and a full address when selected", () => {
  expect(
    serviceSelectionSchema.safeParse({ delivery: { ...leg, areaId: "" } })
      .success,
  ).toBe(false);
  expect(
    serviceSelectionSchema.safeParse({ collection: { ...leg, address: "" } })
      .success,
  ).toBe(false);
});
