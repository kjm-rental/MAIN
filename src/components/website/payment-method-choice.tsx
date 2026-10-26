"use client";
import { customerOnlinePaymentsEnabled } from "@/lib/payment-availability";
import { Banknote, QrCode, LockKeyhole } from "lucide-react";
export function PaymentMethodChoice({
  value,
  methods,
  disabled,
  onlineEnabled = false,
  cashEnabled = true,
  onChange,
}: {
  value: "cash" | "online";
  methods: ("card" | "qrph")[];
  disabled: boolean;
  onChange: (value: "cash" | "online") => void;
  onlineEnabled?: boolean;
  cashEnabled?: boolean;
}) {
  const qrReady =
    customerOnlinePaymentsEnabled && onlineEnabled && methods.includes("qrph");
  const selected = qrReady ? value : "cash";
  return (
    <fieldset disabled={disabled} className="my-6">
      <legend className="text-deep-teal mb-3 text-lg font-bold">
        Choose Your Payment Method
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["cash", "online"] as const).map((method) => {
          const qr = method === "online",
            available = qr ? qrReady : cashEnabled;
          const Icon = qr ? QrCode : Banknote;
          return (
            <label
              key={method}
              aria-disabled={!available}
              className={`flex gap-3 rounded-xl border p-4 transition ${!available ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400" : selected === method ? "border-ocean bg-ocean/5 text-deep-teal ring-ocean/20 cursor-pointer ring-1" : "border-deep-teal/15 text-deep-teal cursor-pointer bg-white"}`}
            >
              <input
                type="radio"
                name="rental-payment-method"
                value={method}
                disabled={!available}
                checked={available && selected === method}
                onChange={() => onChange(method)}
                className="accent-ocean mt-1"
              />
              <span className="min-w-0 flex-1">
                <Icon aria-hidden className="mb-2 size-5" />
                <span className="block text-sm font-bold">
                  {qr ? "QRPh — Pay Online" : "Cash on Pickup / Delivery"}
                </span>
                <span className="mt-1 block text-xs leading-5">
                  {qr
                    ? available
                      ? "Pay rental and services securely with PayMongo."
                      : "Unavailable until live verification is complete."
                    : "Pay when you receive your motorcycle."}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="border-deep-teal/10 mt-4 border-t pt-4">
        <p className="text-muted mb-2 flex items-center gap-1.5 text-xs font-semibold">
          <LockKeyhole aria-hidden className="size-3" />
          More Payment Methods — Coming Soon
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            "Visa",
            "Mastercard",
            "Google Pay",
            "Apple Pay",
            "GCash",
            "Maya",
          ].map((label) => (
            <span
              key={label}
              aria-disabled="true"
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400"
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
