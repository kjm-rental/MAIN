import { customerOnlinePaymentsEnabled } from "@/lib/payment-availability";
import {
  guestRequestSchema,
  customerFieldErrors,
} from "@/lib/guest-checkout/validation";
import {
  guestDb,
  guestHash,
  guestResponse,
  sameOrigin,
  verifyHuman,
} from "@/lib/guest-checkout/server";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return guestResponse(
      { error: "Please submit your booking from the KJM website." },
      403,
    );
  try {
    if (process.env.KJM_LOCAL_BOOKING_DISABLED === "true")
      return guestResponse(
        { error: "Booking submission is unavailable. Please contact KJM." },
        503,
      );
    if (Number(request.headers.get("content-length")) > 20000)
      return guestResponse(
        { error: "Please check your booking details." },
        400,
      );
    const body = await request.json();
    const parsed = guestRequestSchema.safeParse(body);
    if (!parsed.success)
      return guestResponse(
        {
          error: "Please check your booking details.",
          fields: customerFieldErrors({
            fullName: body.p_full_name,
            email: body.p_email,
            phone: body.p_phone,
            country: body.p_country,
            customerType: body.p_customer_type,
          }),
        },
        400,
      );
    if (
      parsed.data.p_payment_method === "qrph" &&
      (!customerOnlinePaymentsEnabled || process.env.PAYMONGO_MODE !== "live")
    )
      return guestResponse(
        { error: "QRPh is not available yet. Please select cash." },
        400,
      );
    if (!(await verifyHuman(parsed.data.captchaToken)))
      return guestResponse(
        { error: "Please complete the security check and try again." },
        400,
      );
    const { captchaToken: _token, ...payload } = parsed.data;
    void _token;
    const { data, error } = await guestDb().rpc(
      "submit_guest_booking_request",
      { p_payload: payload, p_access_hash: await guestHash(true) },
    );
    if (error || !data?.[0])
      return guestResponse(
        {
          error:
            "We couldn’t save your request. Please check availability and try again. If it continues, contact KJM.",
        },
        503,
      );
    return guestResponse(data[0]);
  } catch {
    return guestResponse(
      {
        error:
          "We couldn’t save your request. Please try again or contact KJM.",
      },
      503,
    );
  }
}
