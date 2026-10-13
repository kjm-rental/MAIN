import { VerificationResubmission } from "@/components/website/verification-resubmission";
import { isMissingDepositSchema } from "@/lib/security-deposits";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function BookingStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id,booking_reference,motorcycle_model_id,start_at,end_at,status,status_reason,expires_at,quoted_total_php,pricing_daily_rate_php,pricing_units,base_total_php,extras_total_php,total_centavos",
    )
    .eq("id", id)
    .maybeSingle();
  if (bookingError) throw new Error("Booking status could not be loaded.");
  if (!booking) notFound();
  const [
    { data: model, error: modelError },
    { data: verification, error: verificationError },
    { data: extras, error: extrasError },
    depositResult,
    { data: documents, error: documentsError },
  ] = await Promise.all([
    supabase
      .from("motorcycle_models")
      .select("display_name")
      .eq("is_published", true)
      .is("archived_at", null)
      .eq("id", booking.motorcycle_model_id ?? "")
      .maybeSingle(),
    supabase
      .from("customer_verifications")
      .select("id,overall_status")
      .eq("booking_id", id)
      .maybeSingle(),
    supabase
      .from("booking_extra_items")
      .select("name_snapshot,quantity,line_total_centavos")
      .eq("booking_id", id),
    supabase.rpc("get_booking_deposit_summary", { p_booking_id: id }),
    supabase
      .from("verification_documents")
      .select("document_kind,status,replaced_at")
      .eq("booking_id", id),
  ]);
  if (
    modelError ||
    verificationError ||
    documentsError ||
    extrasError ||
    (depositResult.error && !isMissingDepositSchema(depositResult.error))
  )
    throw new Error("Booking details could not be loaded.");
  const deposit =
    depositResult.data &&
    typeof depositResult.data === "object" &&
    !Array.isArray(depositResult.data)
      ? depositResult.data
      : null;
  const paid =
    typeof deposit?.rental_paid_centavos === "number"
      ? deposit.rental_paid_centavos
      : null;
  const required =
    typeof deposit?.required_centavos === "number"
      ? deposit.required_centavos
      : null;
  const collected =
    typeof deposit?.cash_collected_centavos === "number"
      ? deposit.cash_collected_centavos
      : 0;
  const money = (value: number) =>
    `₱${(value / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const correctionInstructions =
    verification?.overall_status === "resubmission_required"
      ? await supabase.rpc("get_verification_resubmission_instructions", {
          p_booking_id: id,
        })
      : null;
  const pending = ["pending", "submitted"].includes(booking.status);
  const rows = [
    ["Motorcycle", model?.display_name ?? "—"],
    ["Pickup", formatManila(booking.start_at)],
    ["Return", formatManila(booking.end_at)],
    [
      "Booking status",
      booking.status === "confirmed"
        ? `Confirmed — ${verification?.overall_status === "approved" ? "Verified" : verification?.overall_status === "resubmission_required" ? "Resubmission Required" : "Verification Pending"}`
        : booking.status === "cancelled" &&
            verification?.overall_status === "rejected"
          ? "Cancelled — Verification Failed"
          : booking.status,
    ],
    ["Payment Method", "CASH ON PICKUP"],
    [
      "Payment status",
      paid === null
        ? "Payment status unavailable for this legacy record"
        : paid <= 0
          ? "Unpaid"
          : paid < booking.total_centavos
            ? "Partially Paid"
            : "Paid",
    ],
    [
      "Extras",
      extras?.map((e) => `${e.name_snapshot} × ${e.quantity}`).join(", ") ||
        "None",
    ],
    ["Motorcycle rental subtotal", money(booking.base_total_php * 100)],
    ["Optional extras subtotal", money(booking.extras_total_php * 100)],
    ["Rental total", money(booking.total_centavos)],
    [
      "Security deposit option",
      deposit?.option === "cash"
        ? "Cash Security Deposit"
        : deposit?.option === "eligible_id"
          ? `Eligible ID Card Deposit — ${deposit.document_type}`
          : "No historical deposit requirement recorded",
    ],
    [
      "Refundable cash deposit",
      required !== null ? money(required) : "Not configured for this record",
    ],
    [
      "Remaining cash due at pickup",
      required !== null && paid !== null
        ? money(
            Math.max(0, booking.total_centavos - paid) +
              Math.max(0, required - collected),
          )
        : "Refer to KJM’s approved booking record",
    ],
    [
      "Deposit resolution",
      deposit?.unresolved
        ? "Pending resolution"
        : deposit?.id_in_custody
          ? "Approved document in custody"
          : typeof deposit?.cash_held_centavos === "number"
            ? `${money(deposit.cash_held_centavos)} cash liability held`
            : "Not recorded",
    ],
    ["Verification", verification?.overall_status ?? "not submitted"],
    [
      "Price",
      `₱${booking.quoted_total_php.toLocaleString("en-PH")} (${booking.pricing_units ?? "—"} unit(s) at ₱${booking.pricing_daily_rate_php?.toLocaleString("en-PH") ?? "—"})`,
    ],
    ...(booking.expires_at
      ? [["Request expires", formatManila(booking.expires_at)]]
      : []),
    ...(booking.status_reason ? [["Status note", booking.status_reason]] : []),
  ];
  return (
    <main className="bg-off-white min-h-svh py-12">
      <Container>
        <section className="border-deep-teal/10 mx-auto max-w-2xl rounded-[2rem] border bg-white p-7 shadow-sm sm:p-10">
          <p className="text-ocean text-xs font-extrabold tracking-wider uppercase">
            Secure reservation status
          </p>
          <h1 className="text-deep-teal mt-2 text-3xl font-bold">
            {pending
              ? "Booking Request Received"
              : booking.status === "confirmed"
                ? "Booking Confirmed"
                : `Rental ${booking.status}`}
          </h1>
          <p className="text-muted mt-3 text-sm">
            {booking.booking_reference} · Only the authenticated customer
            session that submitted this request can view it.
          </p>
          <dl className="divide-deep-teal/10 border-deep-teal/10 mt-7 divide-y rounded-2xl border">
            {rows.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-5 p-4 text-sm">
                <dt className="text-deep-teal font-bold">{key}</dt>
                <dd className="text-muted text-right capitalize">
                  {value.replaceAll("_", " ")}
                </dd>
              </div>
            ))}
          </dl>
          {verification?.overall_status === "resubmission_required" &&
            ["pending", "confirmed"].includes(booking.status) && (
              <VerificationResubmission
                bookingId={id}
                instructions={
                  correctionInstructions?.data ??
                  "Please follow KJM’s requested corrections or contact KJM for instructions."
                }
                documents={(documents ?? []).filter(
                  (d) => d.status === "resubmission_required" && !d.replaced_at,
                )}
              />
            )}
          <p className="bg-sand/60 text-muted mt-6 rounded-xl p-4 text-sm leading-6">
            {pending
              ? "Your booking request is pending KJM approval."
              : booking.status === "confirmed"
                ? "Your motorcycle is reserved. Document approval and all pickup requirements must be completed before release."
                : "This is the current rental status."}{" "}
            Pay your rental amount in cash when collecting your motorcycle.
            Deposit collection and return are recorded separately.
          </p>
        </section>
      </Container>
    </main>
  );
}

function formatManila(value: string) {
  return new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
}
