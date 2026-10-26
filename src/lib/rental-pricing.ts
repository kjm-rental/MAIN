import { z } from "zod";
export const rentalPricingSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["legacy", "hourly", "next_period"]),
    completeDays: z.number().int().nonnegative().optional(),
    baseDays: z.number().int().nonnegative(),
    baseChargePhp: z.number().int().nonnegative(),
    additionalHours: z.number().int().min(0).max(24),
    hourlyRatePhp: z.number().int().positive().nullable(),
    extensionChargePhp: z.number().int().nonnegative(),
    totalPhp: z.number().int().nonnegative(),
    maxExtensionHours: z.number().int().min(0).max(23).optional(),
  })
  .refine(
    (p) => p.baseChargePhp + p.extensionChargePhp === p.totalPhp,
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
              : `${money(p.extensionChargePhp)} (capped at next period)`,
          ] as [string, string],
        ]
      : []),
  ];
}
