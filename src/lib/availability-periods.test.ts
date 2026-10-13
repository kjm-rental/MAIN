import { expect, it } from "vitest";
import { availabilityPeriod } from "./availability-periods";
const modelId = "00000000-0000-4000-8000-000000000001";
it("checks the full requested duration for initial pickup slots across midnight", () =>
  expect(
    availabilityPeriod("2035-06-01T23:30", {
      modelId,
      kind: "pickup",
      durationMinutes: 2880,
    }),
  ).toEqual({
    key: "2035-06-01T23:30",
    start_at: "2035-06-01T15:30:00.000Z",
    end_at: "2035-06-03T15:30:00.000Z",
  }));
it("uses the exact selected return instead of assuming one day", () =>
  expect(
    availabilityPeriod("2035-06-01T09:00", {
      modelId,
      kind: "pickup",
      returnAt: "2035-06-04T12:30",
      durationMinutes: 1440,
    })?.end_at,
  ).toBe("2035-06-04T04:30:00.000Z"));
it("return slots keep the complete fixed pickup period", () =>
  expect(
    availabilityPeriod("2035-06-03T00:00", {
      modelId,
      kind: "return",
      pickup: "2035-06-01T09:00",
      durationMinutes: 1440,
    }),
  ).toEqual({
    key: "2035-06-03T00:00",
    start_at: "2035-06-01T01:00:00.000Z",
    end_at: "2035-06-02T16:00:00.000Z",
  }));
it("does not invent available return periods without a pickup", () =>
  expect(
    availabilityPeriod("2035-06-01T09:00", {
      modelId,
      kind: "return",
      durationMinutes: 1440,
    }),
  ).toBeNull());
it("rejects reversed or invalid candidate periods", () => {
  expect(
    availabilityPeriod("2035-06-01T09:00", {
      modelId,
      kind: "return",
      pickup: "2035-06-01T10:00",
      durationMinutes: 1440,
    }),
  ).toBeNull();
  expect(
    availabilityPeriod("invalid", {
      modelId,
      kind: "pickup",
      durationMinutes: 1440,
    }),
  ).toBeNull();
});
