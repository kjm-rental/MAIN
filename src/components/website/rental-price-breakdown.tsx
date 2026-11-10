import { rentalPricingRows, parseRentalPricing } from "@/lib/rental-pricing";
export function RentalPriceBreakdown({ value }: { value: unknown }) {
  const pricing = parseRentalPricing(value);
  if (!pricing) return null;
  return (
    <div className="space-y-2 text-sm">
      {rentalPricingRows(value).map(([label, amount]) => (
        <div key={label} className="flex flex-wrap justify-between gap-2">
          <dt>{label}</dt>
          <dd className="font-bold">{amount}</dd>
        </div>
      ))}
      {pricing.mode !== "legacy" && (
        <p className="text-xs text-slate-500">
          {pricing.extensionPolicy ? (
            "Minimum rental: 24 hours. Hourly extensions cost 10% of the daily rate per started hour, up to 2 hours. More than 2 hours is billed as another full rental day."
          ) : (
            <>
              Minimum rental: 24 hours. Additional partial hours round up. The
              configured hourly extension limit is {pricing.maxExtensionHours}{" "}
              hours. Hourly charges are capped at the next applicable complete
              rental period.
            </>
          )}
        </p>
      )}
    </div>
  );
}
