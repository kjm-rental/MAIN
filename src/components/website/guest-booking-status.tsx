"use client";
import { paymentStatusLabel } from "@/lib/paymongo/status-label";
import { useEffect, useState } from "react";
import { BookingDocumentUpload } from "./booking-document-upload";
export function GuestBookingStatus({ id }: { id: string }) {
  const [booking, setBooking] = useState<{
      booking_reference: string;
      status: string;
      total_centavos: number;
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
                setMessage(paymentStatusLabel(result.status));
                setBooking((current) =>
                  current
                    ? { ...current, paymentStatus: result.status }
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
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      setMessage(paymentStatusLabel(result.status));
      if (result.status === "paid")
        setBooking((current) =>
          current ? { ...current, paymentStatus: "paid" } : current,
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
  return (
    <section className="mx-auto max-w-xl space-y-5 py-10">
      <h1 className="text-deep-teal text-2xl font-bold">Your booking</h1>
      {message && <p role="status">{message}</p>}
      {booking && (
        <>
          <p className="font-bold">{booking.booking_reference}</p>
          <p className="capitalize">{booking.status.replaceAll("_", " ")}</p>
          <p>
            Saved rental total: ₱
            {(booking.total_centavos / 100).toLocaleString("en-PH", {
              minimumFractionDigits: 2,
            })}
          </p>
          {booking.services && (
            <section className="space-y-2 rounded-xl border p-4 text-sm">
              <p>
                Delivery:{" "}
                {booking.services.delivery?.address ?? "Self pickup at KJM"} — ₱
                {booking.services.delivery_fee_centavos / 100}
              </p>
              <p>
                Collection:{" "}
                {booking.services.collection?.address ?? "Self return to KJM"} —
                ₱{booking.services.collection_fee_centavos / 100}
              </p>
              <p>
                Payment:{" "}
                {booking.services.payment_method === "qrph"
                  ? "QRPh via PayMongo"
                  : "Cash on Pickup / Delivery"}{" "}
                · {paymentStatusLabel(booking.paymentStatus)}
              </p>
              {booking.services.payment_method === "qrph" &&
                booking.paymentStatus !== "paid" && (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={busy || booking.status !== "confirmed"}
                      onClick={() => void payment(true)}
                      className="rounded-lg border px-3 py-2"
                    >
                      Pay rental & services with QRPh
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void payment()}
                      className="rounded-lg border px-3 py-2"
                    >
                      Check Payment Status
                    </button>
                  </div>
                )}
              <p>
                Refundable security deposit is collected separately in cash at
                handover.
              </p>
            </section>
          )}
          <details>
            <summary className="cursor-pointer py-3 font-bold">
              Replace a requested document
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
        </>
      )}
    </section>
  );
}
