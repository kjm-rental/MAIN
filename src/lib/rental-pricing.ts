import { z } from "zod";
export const rentalPricingSchema = z
  .object({
    version: z.literal(1),
    extensionPolicy: z.literal("ten_percent_two_hours").optional(),
    mode: z.enum(["legacy", "hourly", "next_period"]),
    completeDays: z.number().int().nonnegative().optional(),
    baseDays: z.number().int().nonnegative(),
    baseChargePhp: z.number().nonnegative().multipleOf(0.01),
    additionalHours: z.number().int().min(0).max(24),
    hourlyRatePhp: z.number().nonnegative().multipleOf(0.01).nullable(),
    extensionChargePhp: z.number().nonnegative().multipleOf(0.01),
    totalPhp: z.number().nonnegative().multipleOf(0.01),
    maxExtensionHours: z.number().int().min(0).max(23).optional(),
  })
  .refine(
    (p) =>
      Math.round(p.baseChargePhp * 100) +
        Math.round(p.extensionChargePhp * 100) ===
      Math.round(p.totalPhp * 100),
    "Invalid pricing breakdown",
  );
export type RentalPricing = z.infer<typeof rentalPricingSchema>;
export function parseRentalPricing(value: unknown): RentalPricing | null {
  const result = rentalPricingSchema.safeParse(value);
  return result.success ? result.data : null;
}
export function rentalPricingRows(value: unknown): [string, string][] {
  const p = parseRentalPricing(value);
  if (!p) return [];
  const money = (php: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(php);
  return [
    [
      `Base rental · ${p.baseDays} ${p.mode === "legacy" ? "billed units" : "day(s)"}`,
      money(p.baseChargePhp),
    ],
    ...(p.extensionPolicy && p.additionalHours > 0
      ? [
          [
            "Extension policy",
            "10% of the daily rate per hour, up to 2 hours; over 2 hours bills another full rental day.",
          ] as [string, string],
        ]
      : []),
    ...(p.mode !== "legacy"
      ? [
          ["Additional time", `${p.additionalHours} hour(s), rounded up`] as [
            string,
            string,
          ],
          [
            "Hourly extension rate",
            p.hourlyRatePhp === null
              ? "Not configured"
              : `${money(p.hourlyRatePhp)}/hour`,
          ] as [string, string],
          [
            "Extension charge",
            p.mode === "next_period"
              ? "Included in next complete period above"
              : p.extensionPolicy
                ? money(p.extensionChargePhp)
                : `${money(p.extensionChargePhp)} (capped at next period)`,
          ] as [string, string],
        ]
      : []),
  ];
}
