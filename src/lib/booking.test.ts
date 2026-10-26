import { describe, expect, it } from "vitest";
import {
  estimatedStartedDays,
  manilaInputToIso,
  validateRentalPeriod,
} from "@/lib/booking";
describe("booking dates", () => {
  it("converts Manila wall time to UTC", () =>
    expect(manilaInputToIso("2026-10-10T09:00")).toBe(
      "2026-10-10T01:00:00.000Z",
    ));
  it("rejects past pickup and reversed periods", () => {
    expect(() =>
      validateRentalPeriod(
        "2026-10-09T09:00",
        "2026-10-10T09:00",
        new Date("2026-10-09T02:00:00Z"),
      ),
    ).toThrow(/future/);
    expect(() =>
      validateRentalPeriod(
        "2026-10-11T09:00",
        "2026-10-10T09:00",
        new Date("2026-10-09T00:00:00Z"),
      ),
    ).toThrow(/after/);
  });
  it("rounds started 24-hour periods upward", () =>
    expect(
      estimatedStartedDays("2026-10-10T01:00:00Z", "2026-10-11T02:00:00Z"),
    ).toBe(2));
});

it("keeps the 24-hour minimum while allowing extension times", () => {
  const now = new Date("2029-01-01T00:00:00Z");
  expect(() =>
    validateRentalPeriod("2030-01-01T09:00", "2030-01-02T08:59", now),
  ).toThrow("24 hours");
  for (const end of [
    "2030-01-02T09:00",
    "2030-01-03T09:00",
    "2030-01-03T10:00",
    "2030-01-03T14:00",
    "2030-01-03T10:01",
    "2030-01-08T09:00",
    "2030-01-31T09:00",
  ]) {
    expect(() =>
      validateRentalPeriod("2030-01-01T09:00", end, now),
    ).not.toThrow();
  }
});
