"use client";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  FileText,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { formatCentavos } from "@/lib/currency";
import styles from "./booking-payment.module.css";
import { useEffect, useState } from "react";
import { BookingDocumentUpload } from "./booking-document-upload";
import { InlineQrPayment, type InlinePaymentResult } from "./inline-qr-payment";
export function GuestBookingStatus({ id }: { id: string }) {
  const [inlinePayment, setInlinePayment] =
    useState<InlinePaymentResult | null>(null);
  const [booking, setBooking] = useState<{
      booking_reference: string;
      selected_color?: string | null;
      status: string;
      total_centavos: number;
      start_at?: string;
      end_at?: string;
      deposit_required_centavos?: number;
      paymentStatus?: string;
      services?: {
        delivery?: { address: string };
        collection?: { address: string };
        delivery_fee_centavos: number;
        collection_fee_centavos: number;
        payment_method: string;
      } | null;
    } | null>(null),
    [message, setMessage] = useState("Loading your booking…"),
    [kind, setKind] = useState("passport"),
    [file, setFile] = useState<File>(),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch(`/api/guest/bookings/${id}`, { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (response.ok) {
          const saved = await response.json();
          setBooking(saved);
          setMessage("");
          if (saved.services?.payment_method === "qrph") {
            try {
              const statusResponse = await fetch(
                `/api/guest/bookings/${id}/payment`,
                { cache: "no-store" },
              );
              const result = await statusResponse.json();
              if (active && statusResponse.ok) {
                setInlinePayment(result);
                setMessage("");
                setBooking((current) =>
                  current
                    ? {
                        ...current,
                        status: result.bookingStatus ?? current.status,
                        paymentStatus: result.status,
                      }
                    : current,
                );
              }
            } catch {
              if (active)
                setMessage(
                  "Payment status is temporarily unavailable. Please check again before retrying.",
                );
            }
          }
        } else
          setMessage(
            "Use the browser that made this booking, or contact KJM with your reference.",
          );
      })
      .catch(() => {
        if (active)
          setMessage(
            "Booking updates are temporarily unavailable. Please try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [id]);
  async function payment(start = false) {
    setBusy(true);
    try {
      const response = await fetch(`/api/guest/bookings/${id}/payment`, {
        method: start ? "POST" : "GET",
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setInlinePayment(result);
      setMessage("");
      if (result.status === "paid")
        setBooking((current) =>
          current
            ? {
                ...current,
                status: result.bookingStatus ?? current.status,
                paymentStatus: "paid",
              }
            : current,
        );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Payment status unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      const response = await fetch(`/api/guest/bookings/${id}/documents`, {
        method: "POST",
        body: form,
      });
      setMessage(
        response.ok
          ? "Replacement received. KJM will review your document."
          : "This document cannot be replaced right now. Please contact KJM.",
      );
      if (response.ok) {
        setFile(undefined);
        void fetch(`/api/verification/${id}/prescreen`, {
          method: "POST",
        }).catch(() => undefined);
      }
    } catch {
      setMessage("Upload unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const online = booking?.services?.payment_method === "qrph";
  const paid = booking?.paymentStatus === "paid";
  const ended =
    !!booking && ["cancelled", "expired", "rejected"].includes(booking.status);
  const review = booking?.paymentStatus === "review_required";
  const status = ended
    ? booking.status.replaceAll("_", " ")
    : review
      ? "Payment under review"
      : online && !paid
        ? "Awaiting payment"
        : booking?.status.replaceAll("_", " ");
  const date = (value?: string) =>
    value
      ? new Date(value).toLocaleDateString("en-PH", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "Asia/Manila",
        })
      : "See your booking details";
  const time = (value?: string) =>
    value
      ? new Date(value).toLocaleTimeString("en-PH", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "Asia/Manila",
        })
      : "";
  return (
    <section className={styles.dashboard}>
      <Link href="/motorcycles" className={styles.back}>
        <ArrowLeft size={15} /> Back to motorcycles
      </Link>
      <header className={styles.pageHeading}>
        <div>
          <span className={styles.eyebrow}>YOUR KJM BOOKING</span>
          <h1>
            {!booking
              ? "Your ride, all in one place."
              : ended
                ? "Your booking details."
                : online && !paid
                  ? "One step closer to your ride."
                  : "Your ride, all in one place."}
          </h1>
          <p>
            {online && !paid && !ended
              ? "Complete your payment below. We’ll take care of the rest."
              : ended
                ? "Your booking record and payment details."
                : "Everything you need for your upcoming rental."}
          </p>
        </div>
        <span className={styles.secure}>
          <ShieldCheck size={16} /> Private & secure
        </span>
      </header>
      {message && message !== "Loading your booking…" && (
        <p className={styles.notice} role="status">
          {message}
        </p>
      )}
      {!booking ? (
        <div className={styles.loading} role="status">
          <span className={styles.spinner} />
          {message || "Getting your booking ready…"}
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.detailsColumn}>
            <section
              className={styles.summaryCard}
              aria-label="Booking overview"
            >
              <div className={styles.referenceRow}>
                <span className={styles.eyebrow}>BOOKING REFERENCE</span>
                <span
                  className={`${styles.badge} ${paid || (!online && !ended) ? styles.badgeGood : ""}`}
                >
                  <span />
                  {status}
                </span>
              </div>
              <h2 className={styles.reference}>{booking.booking_reference}</h2>
              <div className={styles.rentalTitle}>
                <span className={styles.rentalIcon}>
                  <MapPin size={22} />
                </span>
                <div>
                  <h3>Your motorcycle rental</h3>
                  <p>
                    {booking.selected_color
                      ? `Selected color · ${booking.selected_color}`
                      : "KJM Motorcycle Rental · Cebu"}
                  </p>
                </div>
              </div>
              <div className={styles.dateGrid}>
                <div>
                  <span className={styles.eyebrow}>PICKUP</span>
                  <strong>{date(booking.start_at)}</strong>
                  <span>{time(booking.start_at)} · Manila time</span>
                </div>
                <div>
                  <span className={styles.eyebrow}>RETURN</span>
                  <strong>{date(booking.end_at)}</strong>
                  <span>{time(booking.end_at)} · Manila time</span>
                </div>
              </div>
              {booking.services && (
                <div className={styles.serviceList}>
                  <div>
                    <MapPin size={17} />
                    <div>
                      <span>Pickup location</span>
                      <strong>
                        {booking.services.delivery?.address ??
                          "Self pickup at KJM"}
                      </strong>
                    </div>
                    <span>
                      {booking.services.delivery_fee_centavos
                        ? formatCentavos(booking.services.delivery_fee_centavos)
                        : "Free"}
                    </span>
                  </div>
                  <div>
                    <ArrowUpRight size={17} />
                    <div>
                      <span>Return location</span>
                      <strong>
                        {booking.services.collection?.address ??
                          "Self return to KJM"}
                      </strong>
                    </div>
                    <span>
                      {booking.services.collection_fee_centavos
                        ? formatCentavos(
                            booking.services.collection_fee_centavos,
                          )
                        : "Free"}
                    </span>
                  </div>
                </div>
              )}
              <div className={styles.totalRow}>
                <div>
                  <span>Rental & services</span>
                  <small>
                    {paid
                      ? "Payment verified"
                      : online
                        ? "Pay securely with QRPh"
                        : "Pay at pickup"}
                  </small>
                </div>
                <strong>{formatCentavos(booking.total_centavos)}</strong>
              </div>
              <div className={styles.depositNote}>
                <Wallet size={18} />
                <p>
                  <strong>Security deposit is separate</strong>
                  <span>
                    {booking.deposit_required_centavos
                      ? `${formatCentavos(booking.deposit_required_centavos)} refundable cash deposit, collected at handover.`
                      : "Your refundable cash deposit is collected at handover."}
                  </span>
                </p>
              </div>
            </section>
            <div className={styles.helpCard}>
              <span className={styles.helpIcon}>
                <ShieldCheck size={21} />
              </span>
              <div>
                <h3>A little help, whenever you need it.</h3>
                <p>Questions about your ride or payment?</p>
              </div>
              <Link href="/contact" aria-label="Contact KJM">
                <ArrowUpRight size={21} />
              </Link>
            </div>
            <details className={styles.documents}>
              <summary>
                <FileText size={18} />
                Document support
              </summary>
              <p className="mb-3 text-sm">
                Use this only when KJM asks for a correction. Approved documents
                stay protected.
              </p>
              <select
                aria-label="Document to replace"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="field"
              >
                {[
                  "passport",
                  "government_id",
                  "drivers_license_front",
                  "drivers_license_back",
                  "international_driving_permit",
                  "supporting_document",
                ].map((kind) => (
                  <option key={kind} value={kind}>
                    {kind.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <BookingDocumentUpload
                label="Replacement document"
                file={file}
                onChange={setFile}
              />
              <button
                disabled={busy || !file}
                onClick={() => void upload()}
                className="bg-deep-teal mt-3 rounded-lg px-5 py-3 font-bold text-white disabled:opacity-50"
              >
                {busy ? "Uploading…" : "Send replacement"}
              </button>
            </details>
          </div>
          <div className={styles.paymentColumn}>
            {online ? (
              <>
                <div className={styles.paymentToolbar}>
                  <span>
                    <ShieldCheck size={15} /> SECURE PAYMENT
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void payment()}
                    aria-label="Refresh payment status"
                  >
                    <RefreshCw
                      size={15}
                      className={busy ? styles.spinner : ""}
                    />{" "}
                    Refresh
                  </button>
                </div>
                <InlineQrPayment
                  bookingId={id}
                  initial={
                    inlinePayment ?? {
                      status: paid
                        ? "paid"
                        : ended
                          ? "cancelled_unpaid"
                          : "not_started",
                      amountCentavos: booking.total_centavos,
                    }
                  }
                  showStatusLink={false}
                  onGenerate={
                    !ended && !paid ? () => void payment(true) : undefined
                  }
                  busy={busy}
                  onPaid={(result) => {
                    setInlinePayment(result);
                    setMessage("");
                    setBooking((current) =>
                      current
                        ? {
                            ...current,
                            paymentStatus: "paid",
                            status: result.bookingStatus ?? current.status,
                          }
                        : current,
                    );
                  }}
                />
              </>
            ) : (
              <section className={styles.cashCard}>
                <span className={styles.cashIcon}>
                  <Wallet size={30} />
                </span>
                <span className={styles.eyebrow}>PAYMENT METHOD</span>
                <h2>Pay when you pick up.</h2>
                <p>
                  Your rental payment will be collected at pickup or delivery.
                  Keep your booking reference handy.
                </p>
                <div>
                  <Check size={17} /> No online payment needed
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
