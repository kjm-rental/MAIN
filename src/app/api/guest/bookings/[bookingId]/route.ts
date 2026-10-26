import { z } from "zod";
import {
  ownedGuestBooking,
  guestResponse,
  sameOrigin,
} from "@/lib/guest-checkout/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    const id = z.uuid().parse((await params).bookingId),
      access = await ownedGuestBooking(id);
    if (!access)
      return guestResponse(
        {
          error:
            "Booking unavailable. Please use the original browser or contact KJM.",
        },
        404,
      );
    const { data, error } = await access.db
      .from("bookings")
      .select(
        "booking_reference,status,start_at,end_at,total_centavos,deposit_required_centavos,rental_pricing",
      )
      .eq("id", id)
      .single();
    const services = await access.db
      .from("booking_services")
      .select(
        "delivery,collection,delivery_fee_centavos,collection_fee_centavos,payment_method",
      )
      .eq("booking_id", id)
      .maybeSingle();
    const payments = await access.db
      .from("payment_events")
      .select("event_type,amount_centavos")
      .eq("booking_id", id);
    const paid = (payments.data ?? []).reduce(
      (sum: number, e: { event_type: string; amount_centavos: number }) =>
        sum +
        (e.event_type === "payment" ? e.amount_centavos : -e.amount_centavos),
      0,
    );
    return error
      ? guestResponse(
          { error: "Booking updates are temporarily unavailable." },
          503,
        )
      : guestResponse({
          ...data,
          services: services.data,
          paymentStatus: payments.error
            ? "unavailable"
            : paid >= (data?.total_centavos ?? Infinity)
              ? "paid"
              : "unpaid",
        });
  } catch {
    return guestResponse({ error: "Booking unavailable." }, 404);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  if (!sameOrigin(request))
    return guestResponse({ error: "Please use the KJM website." }, 403);
  try {
    const id = z.uuid().parse((await params).bookingId),
      access = await ownedGuestBooking(id);
    if (!access) return guestResponse({ error: "Booking unavailable." }, 404);
    const { error } = await access.db.rpc("abandon_guest_booking_request", {
      p_booking_id: id,
      p_access_hash: access.hash,
    });
    return error
      ? guestResponse(
          {
            error: "The request cannot be reset right now. Please contact KJM.",
          },
          400,
        )
      : guestResponse({ saved: true });
  } catch {
    return guestResponse(
      { error: "The request cannot be reset right now." },
      503,
    );
  }
}
