import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { rentalPricingRows, parseRentalPricing } from "./rental-pricing";
const sql = readFileSync(
  new URL(
    "../../supabase/migrations/202610260032_hourly_extension_pricing.sql",
    import.meta.url,
  ),
  "utf8",
);
const saved = {
  version: 1,
  mode: "hourly",
  baseDays: 2,
  baseChargePhp: 1400,
  additionalHours: 5,
  hourlyRatePhp: 70,
  extensionChargePhp: 350,
  totalPhp: 1750,
  maxExtensionHours: 23,
};
it("shows the actual saved 48h + 5h pricing snapshot", () => {
  expect(parseRentalPricing(saved)?.totalPhp).toBe(1750);
  expect(rentalPricingRows(saved).flat().join(" ")).toContain("₱1,400.00");
  expect(rentalPricingRows(saved).flat().join(" ")).toContain("₱350.00");
});
it("does not manufacture hourly charges for legacy bookings", () => {
  expect(parseRentalPricing(undefined)).toBeNull();
  expect(rentalPricingRows(null)).toEqual([]);
  expect(
    rentalPricingRows({
      ...saved,
      mode: "legacy",
      additionalHours: 0,
      baseChargePhp: 2100,
      extensionChargePhp: 0,
      totalPhp: 2100,
      hourlyRatePhp: null,
    }),
  ).toHaveLength(1);
});
it("rejects inconsistent saved breakdowns", () =>
  expect(parseRentalPricing({ ...saved, totalPhp: 1 })).toBeNull());
it("leaves pricing inactive until an explicit policy and model rate exist", () => {
  expect(sql).toContain(
    "if limit_hours is null or model.hourly_extension_rate_php is null then",
  );
  expect(sql).not.toMatch(/update public\.booking_settings/i);
  expect(sql).toContain("calculate_booking_quote_before_hourly");
});
it("keeps existing booking amounts and existing model rate types untouched", () => {
  expect(sql).not.toMatch(/update public\.bookings/i);
  expect(sql).not.toMatch(
    /set (daily_rate_php|weekly_rate_php|monthly_rate_php)/i,
  );
  expect(sql).not.toMatch(/insert into public\.motorcycle_models/i);
  expect(sql).toContain("new.rental_pricing:=old.rental_pricing; return new;");
});
it("retains server gates and caps rounded hours at the next package price", () => {
  for (const term of [
    "private.assert_booking_period_allowed",
    "private.is_active_booking_tester",
    "ceil(mod(p_seconds,86400)/3600)",
    "hours>p_limit",
    "greatest(0,next_total-base)",
    "revoke all",
  ]) {
    expect(sql).toContain(term);
  }
  expect(sql).toContain("Minimum rental duration is 24 hours");
});
it("keeps MAIN and ADMIN snapshot presentation identical", () => {
  expect(
    readFileSync(
      new URL("../../../KJM ADMIN/src/lib/rental-pricing.ts", import.meta.url),
      "utf8",
    ),
  ).toBe(readFileSync(new URL("./rental-pricing.ts", import.meta.url), "utf8"));
});
