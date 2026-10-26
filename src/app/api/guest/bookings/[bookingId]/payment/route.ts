import { paymongoLiveMode } from "@/lib/paymongo/mode";
import { z } from "zod";
import {
  ownedGuestBooking,
  guestResponse,
  sameOrigin,
} from "@/lib/guest-checkout/server";
import { customerOnlinePaymentsEnabled } from "@/lib/payment-availability";
import {
  configuration,
  createCheckout,
  databaseClient,
  loadCheckout,
  reconcile,
  failure,
  PaymentError,
} from "@/lib/paymongo/test-payments";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    if (!sameOrigin(request))
      throw new PaymentError(403, "Please use the KJM website.");
    if (!customerOnlinePaymentsEnabled || !paymongoLiveMode())
      throw new PaymentError(
        503,
        "QRPh is unavailable until live verification is complete. No payment was requested.",
      );
    configuration(true);
    const id = z.uuid().parse((await params).bookingId);
    const access = await ownedGuestBooking(id);
    if (!access) throw new PaymentError(404, "Booking unavailable.");
    // One durable key per booking, including reloads/retries. Browser amounts are ignored.
    return guestResponse(
      await createCheckout(databaseClient(), id, null, id, access.hash),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  try {
    const id = z.uuid().parse((await params).bookingId);
    const access = await ownedGuestBooking(id);
    if (!access) throw new PaymentError(404, "Booking unavailable.");
    if (!paymongoLiveMode()) return guestResponse({ status: "unavailable" });
    const { data, error } = await access.db.rpc("get_guest_payment_checkout", {
      p_booking_id: id,
      p_access_hash: access.hash,
    });
    if (error)
      throw new PaymentError(503, "Payment status is temporarily unavailable.");
    if (!data) return guestResponse({ status: "not_started" });
    const c = await loadCheckout(databaseClient(), data);
    return guestResponse(await reconcile(databaseClient(), c));
  } catch (error) {
    return failure(error);
  }
}
