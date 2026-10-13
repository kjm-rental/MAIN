import { describe, expect, it } from "vitest";
import {
  formatRentalTime,
  isRentalTimeSelectable,
  manilaDay,
  readRentalOperatingHours,
  rentalTimeSlots,
  shiftRentalDay,
  type RentalOperatingHours,
} from "./rental-time-slots";

const hours: RentalOperatingHours = {
  sunday: { enabled: false },
  monday: {
    enabled: true,
    pickupOpen: "08:00",
    pickupClose: "00:00",
    returnOpen: "09:00",
    returnClose: "18:00",
  },
  tuesday: { enabled: false },
};

describe("configured rental time slots", () => {
  it("generates half-hour slots from configured pickup hours, including end-of-day midnight", () => {
    const slots = rentalTimeSlots("2026-10-12", hours, "pickup");
    expect(slots).toHaveLength(33);
    expect(slots[0]).toEqual({
      value: "2026-10-12T08:00",
      label: "8:00 AM",
      nextDay: false,
    });
    expect(slots[1].value).toBe("2026-10-12T08:30");
    expect(slots.at(-1)).toEqual({
      value: "2026-10-13T00:00",
      label: "12:00 AM",
      nextDay: true,
    });
    expect(slots.some((s) => s.value === "2026-10-12T00:00")).toBe(false);
  });
  it("uses separate return hours with inclusive endpoints", () => {
    const slots = rentalTimeSlots("2026-10-12", hours, "return");
    expect(slots).toHaveLength(19);
    expect(slots[0].value).toBe("2026-10-12T09:00");
    expect(slots.at(-1)?.value).toBe("2026-10-12T18:00");
  });
  it("preserves previous-day closing midnight on an otherwise closed day", () => {
    expect(rentalTimeSlots("2026-10-13", hours, "pickup")).toEqual([
      { value: "2026-10-13T00:00", label: "12:00 AM", nextDay: false },
    ]);
    expect(rentalTimeSlots("2026-10-13", hours, "return")).toEqual([]);
  });
  it("keeps both distinct midnight boundaries without duplicating the same instant", () => {
    const daily = {
      enabled: true as const,
      pickupOpen: "00:00",
      pickupClose: "00:00",
      returnOpen: "00:00",
      returnClose: "00:00",
    };
    const slots = rentalTimeSlots(
      "2026-10-12",
      { sunday: daily, monday: daily },
      "pickup",
    );
    expect(slots).toHaveLength(49);
    expect(new Set(slots.map((s) => s.value)).size).toBe(49);
    expect(slots[0].value).toBe("2026-10-12T00:00");
    expect(slots.at(-1)?.value).toBe("2026-10-13T00:00");
  });
  it("keeps exact configured non-half-hour boundaries without extending hours", () => {
    const slots = rentalTimeSlots(
      "2026-10-12",
      {
        monday: {
          enabled: true,
          pickupOpen: "08:15",
          pickupClose: "23:59",
          returnOpen: "09:10",
          returnClose: "10:10",
        },
      },
      "pickup",
    );
    expect(slots[0].value).toBe("2026-10-12T08:15");
    expect(slots[1].value).toBe("2026-10-12T08:30");
    expect(slots.at(-1)?.value).toBe("2026-10-12T23:59");
    expect(slots.some((s) => s.nextDay)).toBe(false);
  });
  it("handles year and month rollover", () => {
    expect(shiftRentalDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftRentalDay("2026-03-01", -1)).toBe("2026-02-28");
    const thursday = hours.monday!;
    expect(
      rentalTimeSlots("2026-12-31", { thursday }, "pickup").at(-1)?.value,
    ).toBe("2027-01-01T00:00");
  });
  it("fails closed for missing/invalid schedules and dates", () => {
    for (const value of [
      null,
      {},
      [],
      { monday: { enabled: true, pickupOpen: "08:00" } },
      {
        monday: {
          enabled: true,
          pickupOpen: "23:00",
          pickupClose: "01:00",
          returnOpen: "09:00",
          returnClose: "18:00",
        },
      },
    ])
      expect(readRentalOperatingHours(value)).toBeNull();
    expect(readRentalOperatingHours(hours)).toEqual(hours);
    expect(rentalTimeSlots("2026-02-30", hours, "pickup")).toEqual([]);
    expect(rentalTimeSlots("2026-10-12", null, "return")).toEqual([]);
  });
});
describe("Manila boundaries and pickup/return ordering", () => {
  const now = new Date("2026-10-12T00:15:00Z"); // 08:15 Manila
  it("disables past/equal times independently of host timezone", () => {
    expect(isRentalTimeSelectable("2026-10-12T08:00", now)).toBe(false);
    expect(isRentalTimeSelectable("2026-10-12T08:15", now)).toBe(false);
    expect(isRentalTimeSelectable("2026-10-12T08:30", now)).toBe(true);
    expect(
      isRentalTimeSelectable(
        "2026-10-13T00:00",
        new Date("2026-10-12T15:59:00Z"),
      ),
    ).toBe(true);
    expect(
      isRentalTimeSelectable(
        "2026-10-13T00:00",
        new Date("2026-10-12T16:00:00Z"),
      ),
    ).toBe(false);
  });
  it("requires return strictly after pickup, including across midnight", () => {
    expect(
      isRentalTimeSelectable("2026-10-13T00:00", now, "2026-10-12T23:30"),
    ).toBe(true);
    expect(
      isRentalTimeSelectable("2026-10-12T23:30", now, "2026-10-12T23:30"),
    ).toBe(false);
    expect(
      isRentalTimeSelectable("2026-10-12T23:00", now, "2026-10-12T23:30"),
    ).toBe(false);
    expect(isRentalTimeSelectable("2026-10-13T00:00", now, "invalid")).toBe(
      false,
    );
  });
  it("uses Manila calendar dates at the UTC date boundary", () => {
    expect(manilaDay(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
  });
  it.each([
    ["00:00", "12:00 AM"],
    ["08:30", "8:30 AM"],
    ["12:00", "12:00 PM"],
    ["23:30", "11:30 PM"],
  ])("formats %s as %s", (time, label) =>
    expect(formatRentalTime(time)).toBe(label),
  );
});
