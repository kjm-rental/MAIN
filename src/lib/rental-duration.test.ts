import { expect, it } from "vitest";
import { rentalDuration } from "./rental-duration";
it.each([
  [24, "1 day"],
  [25, "1 day + 1 hour"],
  [26, "1 day + 2 hours"],
  [48, "2 days"],
  [49, "2 days + 1 hour"],
  [53, "2 days + 5 hours"],
  [72, "3 days"],
  [168, "7 days"],
  [720, "30 days"],
  [25.01, "1 day + 2 hours"],
])(
  "labels %s hours using complete days and rounded remaining hours",
  (hours, label) => {
    expect(
      rentalDuration(
        "2026-10-27T13:00:00+08:00",
        new Date(
          Date.parse("2026-10-27T13:00:00+08:00") + Number(hours) * 3600000,
        ).toISOString(),
      )?.label,
    ).toBe(label);
  },
);
it("rejects less than 24 hours", () =>
  expect(
    rentalDuration("2026-10-27T13:00:00+08:00", "2026-10-28T12:59:00+08:00"),
  ).toBeNull());

it("prepares a restriction error rather than next-day charging without changing saved policy or bookings", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(
    new URL(
      "../../supabase/migrations/202610260034_restrict_hourly_extensions.sql",
      import.meta.url,
    ),
    "utf8",
  );
  expect(sql).toContain(
    "raise exception 'Selected extension is % rounded hours",
  );
  expect(sql).not.toContain("update public.bookings");
  expect(sql).not.toContain("update public.booking_settings");
  expect(sql).toContain("greatest(0,next_total-base)");
});
