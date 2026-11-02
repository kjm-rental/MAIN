"use client";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatCentavos } from "@/lib/currency";

export type InlinePaymentResult = {
  status: string; qrImage?: string | null; expiresAt?: string;
  amountCentavos?: number; bookingStatus?: string;
};
export function InlineQrPayment({ bookingId, initial, onPaid }: {
  bookingId: string; initial?: InlinePaymentResult | null;
  onPaid?: (payment: InlinePaymentResult) => void;
}) {
  const [remote, setPayment] = useState<InlinePaymentResult | null>(null);
  const [now, setNow] = useState(0);
  const payment = useMemo(() => remote?.status === "not_started" ? initial ?? remote : remote ?? initial ?? { status: "pending" }, [remote, initial]);
  const [message, setMessage] = useState("");
  const callback = useRef(onPaid);
  const delivered = useRef(false);
  useEffect(() => { callback.current = onPaid; }, [onPaid]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function check() {
      if (active) setNow(Date.now());
      try {
        const r = await fetch(`/api/guest/bookings/${bookingId}/payment`, { cache: "no-store", signal: controller.signal });
        const data = await r.json();
        if (!active) return;
        if (!r.ok) { setMessage("Payment verification is temporarily unavailable. Keep this page open; do not pay a second time."); }
        else { setPayment(data); setMessage(""); }
      } catch { if (active) setMessage("Reconnecting to payment verification…"); }
      if (active) timer = setTimeout(check, 5000);
    }
    timer = setTimeout(check, 1500);
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [bookingId]);
  useEffect(() => {
    if (payment.status === "paid" && !delivered.current) {
      delivered.current = true;
      callback.current?.(payment);
    }
  }, [payment]);
  const expired = !!payment.expiresAt && Date.parse(payment.expiresAt) <= now;
  const paid = payment.status === "paid";
  const terminal = ["expired_unpaid", "cancelled_unpaid", "review_required"].includes(payment.status);
  return (
    <section aria-label="QRPh payment" className="border-deep-teal/15 bg-white mt-5 rounded-2xl border p-5 text-center">
      <h3 className="text-deep-teal text-xl font-bold">{paid ? "Payment verified" : "Scan to pay with QRPh"}</h3>
      {payment.amountCentavos != null && <p className="text-ocean my-3 text-2xl font-bold">{formatCentavos(payment.amountCentavos)}</p>}
      {!paid && !expired && !terminal && payment.qrImage && (
        <Image src={payment.qrImage} alt="Scan this QRPh code with your bank or e-wallet app to pay the saved rental amount" width={260} height={260} unoptimized className="mx-auto my-4 rounded-xl bg-white p-2" />
      )}
      <p role="status" className="text-muted mt-3 text-sm leading-6">
        {paid ? "Your payment has been verified by PayMongo."
          : payment.status === "review_required" ? "Payment needs KJM review. Do not pay again; contact KJM with your booking reference."
          : expired || terminal ? "This payment window has ended. Contact KJM before starting another payment."
          : payment.qrImage ? "Use your bank or e-wallet app to scan this code. Your booking is awaiting payment. This page updates automatically."
          : "Preparing your payment code. Your booking is awaiting payment."}
      </p>
      {!paid && payment.expiresAt && <p className="text-muted mt-2 text-xs">Payment window ends at {new Date(payment.expiresAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })} Manila time.</p>}
      <p className="text-muted mt-2 text-xs">The refundable cash deposit is collected separately at handover.</p>
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
      <Link href={`/guest/booking/${bookingId}`} className="text-ocean mt-4 inline-block text-sm font-bold underline">View secure booking and payment status</Link>
    </section>
  );
}
