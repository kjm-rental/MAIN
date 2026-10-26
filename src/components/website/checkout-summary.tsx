import Image from "next/image";
import { formatCentavos } from "@/lib/currency";
import { parseRentalPricing } from "@/lib/rental-pricing";
export type CheckoutSummaryProps = {
  model: string;
  image?: { src: string; alt: string } | null;
  pickup: string;
  returnAt: string;
  duration: string;
  rentalCentavos: number | null;
  extrasCentavos: number;
  deliveryCentavos: number;
  collectionCentavos: number;
  totalCentavos: number | null;
  depositCentavos: number | null;
  online: boolean;
  pricing?: unknown;
  servicesPending?: boolean;
};
export function CheckoutSummary(p: CheckoutSummaryProps) {
  const pricing = parseRentalPricing(p.pricing);
  const money = (v: number | null) =>
    v === null ? "Choose your dates" : formatCentavos(v);
  const total =
    p.totalCentavos === null || p.depositCentavos === null
      ? null
      : p.totalCentavos + p.depositCentavos;
  return (
    <div className="border-deep-teal/10 overflow-hidden rounded-2xl border bg-white shadow-sm">
      {p.image && (
        <div className="bg-sand/30 p-4">
          <Image
            src={p.image.src}
            alt={p.image.alt}
            width={480}
            height={280}
            className="h-36 w-full object-contain"
          />
        </div>
      )}
      <div className="space-y-5 p-5">
        <header>
          <p className="text-ocean text-xs font-bold tracking-widest uppercase">
            Your island ride
          </p>
          <h2 className="text-deep-teal mt-1 text-xl font-extrabold">
            {p.model}
          </h2>
        </header>
        <dl className="space-y-2 text-sm">
          <Row label="Pickup" value={p.pickup} />
          <Row label="Return" value={p.returnAt} />
          <Row label="Duration" value={p.duration} />
        </dl>
        <dl className="border-deep-teal/10 space-y-2 border-t pt-4 text-sm">
          <Row label="Rental amount" value={money(p.rentalCentavos)} />
          {pricing && pricing.additionalHours > 0 && (
            <div className="bg-sand/40 rounded-lg px-3 py-2 text-xs">
              <p className="flex justify-between gap-3">
                <span>
                  Includes {pricing.additionalHours} additional{" "}
                  {pricing.additionalHours === 1 ? "hour" : "hours"}
                </span>
                <strong>
                  {formatCentavos(pricing.extensionChargePhp * 100)}
                </strong>
              </p>
              <details className="mt-1">
                <summary className="text-ocean cursor-pointer">
                  View calculation
                </summary>
                <p className="mt-2 leading-5">
                  {pricing.additionalHours} hours ×{" "}
                  {formatCentavos((pricing.hourlyRatePhp ?? 0) * 100)}/hour.
                  Partial hours round up; the extension is capped at the next
                  complete rental period.
                </p>
              </details>
            </div>
          )}
          {p.extrasCentavos > 0 && (
            <Row label="Extras" value={money(p.extrasCentavos)} />
          )}
          {p.deliveryCentavos > 0 && (
            <Row label="Delivery fee" value={money(p.deliveryCentavos)} />
          )}
          {p.collectionCentavos > 0 && (
            <Row label="Collection fee" value={money(p.collectionCentavos)} />
          )}
          <div className="border-deep-teal/10 text-deep-teal border-t pt-3 font-bold">
            <Row
              label="Rental & services"
              value={
                p.servicesPending ? "Quote pending" : money(p.totalCentavos)
              }
            />
          </div>
          <Row
            label="Refundable cash deposit"
            value={money(p.depositCentavos)}
          />
          <div className="border-deep-teal/10 text-deep-teal border-t pt-3 font-extrabold">
            <Row
              label="Total amount due"
              value={p.servicesPending ? "Quote pending" : money(total)}
            />
          </div>
        </dl>
        <div className="bg-deep-teal space-y-2 rounded-xl p-4 text-sm text-white">
          <dl className="space-y-2">
            {p.online && (
              <Row
                label="Pay online · rental & services"
                value={
                  p.servicesPending ? "Quote pending" : money(p.totalCentavos)
                }
              />
            )}
            <Row
              label={
                p.online ? "Cash at handover · deposit" : "Cash at handover"
              }
              value={
                p.servicesPending
                  ? "Quote pending"
                  : money(p.online ? p.depositCentavos : total)
              }
            />
          </dl>
          <p className="text-xs leading-5 text-white/75">
            {p.online
              ? "The refundable deposit is separate from your online payment."
              : "Includes your refundable deposit, returned after inspection."}
          </p>
        </div>
      </div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="min-w-0">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
