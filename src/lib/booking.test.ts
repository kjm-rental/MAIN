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
