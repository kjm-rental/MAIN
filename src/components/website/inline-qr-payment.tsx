"use client";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  LockKeyhole,
  QrCode,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import styles from "./booking-payment.module.css";
import { formatCentavos } from "@/lib/currency";

export type InlinePaymentResult = {
  status: string;
  qrImage?: string | null;
  expiresAt?: string;
  amountCentavos?: number;
  bookingStatus?: string;
};
export function InlineQrPayment({
  bookingId,
  initial,
  onPaid,
  showStatusLink = true,
  onGenerate,
  busy = false,
}: {
  bookingId: string;
  initial?: InlinePaymentResult | null;
  onPaid?: (payment: InlinePaymentResult) => void;
  showStatusLink?: boolean;
  onGenerate?: () => void;
  busy?: boolean;
}) {
  const [remote, setPayment] = useState<InlinePaymentResult | null>(null);
  const [now, setNow] = useState(0);
  const payment = useMemo(
    () =>
      remote?.status === "not_started"
        ? (initial ?? remote)
        : (remote ?? initial ?? { status: "pending" }),
    [remote, initial],
  );
  const [message, setMessage] = useState("");
  const callback = useRef(onPaid);
  const delivered = useRef(false);
  useEffect(() => {
    callback.current = onPaid;
  }, [onPaid]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function check() {
      if (active) setNow(Date.now());
      try {
        const r = await fetch(`/api/guest/bookings/${bookingId}/payment`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await r.json();
        if (!active) return;
        if (!r.ok) {
          setMessage(
            "Payment verification is temporarily unavailable. Keep this page open; do not pay a second time.",
          );
        } else {
          setPayment(data);
          setMessage("");
        }
      } catch {
        if (active) setMessage("Reconnecting to payment verification…");
      }
      if (active) timer = setTimeout(check, 5000);
    }
    timer = setTimeout(check, 1500);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [bookingId]);
  useEffect(() => {
    if (payment.status === "paid" && !delivered.current) {
      delivered.current = true;
      callback.current?.(payment);
    }
  }, [payment]);
  const expired = !!payment.expiresAt && Date.parse(payment.expiresAt) <= now;
  const paid = payment.status === "paid";
  const terminal = [
    "expired_unpaid",
    "cancelled_unpaid",
    "review_required",
  ].includes(payment.status);
  return (
    <section aria-label="QRPh payment" className={styles.qrCard}>
      <div className={styles.qrHeading}>
        <span className={styles.eyebrow}>
          {paid ? "PAYMENT COMPLETE" : "RENTAL PAYMENT"}
        </span>
        <span className={styles.qrBrand}>
          <QrCode size={16} /> QRPh
        </span>
      </div>
      <h3>
        {paid
          ? "You’re all paid up."
          : terminal || expired
            ? "Let’s check your payment."
            : "Scan. Pay. You’re on your way."}
      </h3>
      <p className={styles.qrSubtitle}>
        {paid
          ? "Verified securely by PayMongo."
          : "Scan to pay with QRPh using your bank or e-wallet."}
      </p>
      {payment.amountCentavos != null && (
        <p className={styles.qrAmount}>
          {formatCentavos(payment.amountCentavos)}
          <span>PHP</span>
        </p>
      )}
      {paid ? (
        <div className={styles.paidMark}>
          <CheckCircle2 size={68} strokeWidth={1.4} />
        </div>
      ) : !expired && !terminal && payment.qrImage ? (
        <div className={styles.qrFrame}>
          <Image
            src={payment.qrImage}
            alt="Scan this QRPh code with your bank or e-wallet app to pay the saved rental amount"
            width={224}
            height={224}
            unoptimized
          />
          <span>
            <Smartphone size={14} /> Scan with your banking app
          </span>
        </div>
      ) : !terminal && !expired ? (
        <div className={styles.qrPlaceholder}>
          <QrCode size={48} strokeWidth={1.2} />
          <p>
            {onGenerate
              ? "Ready when you are."
              : "Preparing your payment code…"}
          </p>
          {onGenerate && (
            <button type="button" disabled={busy} onClick={onGenerate}>
              {busy ? "Preparing QR…" : "Show payment QR"}
            </button>
          )}
        </div>
      ) : null}
      <div
        className={`${styles.liveStatus} ${paid ? styles.liveStatusPaid : ""}`}
        role="status"
      >
        <span />
        {paid
          ? "Payment verified"
          : payment.status === "review_required"
            ? "KJM review needed · please don’t pay again"
            : expired || terminal
              ? "Payment window ended · contact KJM"
              : "Awaiting payment · updates automatically"}
      </div>
      {!paid && !expired && !terminal && (
        <div className={styles.paySteps}>
          <div>
            <span>1</span>Open your bank or e-wallet
          </div>
          <div>
            <span>2</span>Scan the QR & confirm the amount
          </div>
          <div>
            <span>3</span>Pay, then return here for confirmation
          </div>
        </div>
      )}
      {!paid && payment.expiresAt && (
        <p className={styles.expiry}>
          Payment window ends at{" "}
          <strong>
            {new Date(payment.expiresAt).toLocaleTimeString("en-PH", {
              timeZone: "Asia/Manila",
              hour: "numeric",
              minute: "2-digit",
            })}
          </strong>{" "}
          · Manila time
        </p>
      )}
      {!paid && !terminal && !expired && (
        <p className={styles.awaitingNote}>
          Your booking is awaiting payment. Please pay only once.
        </p>
      )}
      {message && (
        <p role="status" className={styles.qrNotice}>
          {message}
        </p>
      )}
      <div className={styles.qrSecurity}>
        <LockKeyhole size={13} />
        <span>
          Secured by <strong>PayMongo</strong>
        </span>
        <ShieldCheck size={14} />
      </div>
      {showStatusLink && (
        <>
          <p className={styles.awaitingNote}>
            Refundable cash deposit collected separately at handover.
          </p>
          <Link
            href={`/guest/booking/${bookingId}`}
            className={styles.statusLink}
          >
            View booking & payment status <Check size={13} />
          </Link>
        </>
      )}
    </section>
  );
}
