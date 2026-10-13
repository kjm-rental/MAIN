"use client";
import { Banknote, CreditCard, QrCode, ShieldCheck } from "lucide-react";
export function PaymentMethodChoice({ value, methods, disabled, onlineEnabled = false, onChange }: {
  value: "cash" | "online"; methods: ("card" | "qrph")[]; disabled: boolean;
  onChange: (value: "cash" | "online") => void;
  onlineEnabled?: boolean;
}) {
  return <fieldset className="my-6 space-y-3" disabled={disabled}>
    <legend className="text-deep-teal mb-3 text-lg font-bold">How would you like to pay?</legend>
    {(["online", "cash"] as const).filter(method => method === "cash" || methods.length > 0).map(method => {
      const online = method === "online";
      return <label key={method} className={`flex min-h-24 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${value === method ? "border-ocean bg-ocean/5" : "border-deep-teal/15 bg-white"}`}>
        <input type="radio" name="rental-payment-method" value={method} disabled={online && !onlineEnabled} checked={value === method} onChange={() => onChange(method)} className="accent-ocean mt-1 size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="text-deep-teal block font-bold">{online ? "Pay Online" : "Cash on Pickup"}{online && !onlineEnabled && <span className="bg-sand ml-2 inline-block rounded-full px-2 py-1 text-xs font-semibold">Coming soon</span>}</span>
          <span className="text-muted mt-1 block text-sm leading-6">{online ? (onlineEnabled ? "Choose your payment method on our secure checkout." : "Online checkout is not available yet. Please choose Cash on Pickup.") : "Pay your rental amount when you collect your motorcycle."}</span>
          {online && <span className="text-deep-teal mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold">
            {methods.includes("card") && <span className="inline-flex items-center gap-1.5"><CreditCard aria-hidden className="size-4" />Credit / Debit Card</span>}
            {methods.includes("qrph") && <span className="inline-flex items-center gap-1.5"><QrCode aria-hidden className="size-4" />QR Code / E-Wallet</span>}
          </span>}
        </span>
        {online ? <ShieldCheck aria-hidden className="text-ocean size-5 shrink-0" /> : <Banknote aria-hidden className="text-ocean size-5 shrink-0" />}
      </label>;
    })}
  </fieldset>;
}
