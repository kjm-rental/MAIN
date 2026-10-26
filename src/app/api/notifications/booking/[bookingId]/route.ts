import { notificationReady } from "@/lib/notifications/readiness";
import { bookingRequestOrigin } from "@/lib/notifications/booking-test";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { notificationServer } from "@/lib/notifications/server";
import { dispatchOne } from "@/lib/notifications/worker";
export const maxDuration = 60;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const respond = (status: number) =>
    new Response(null, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  const origin = request.headers.get("origin");
  if (origin && origin !== bookingRequestOrigin(request)) return respond(403);
  const id = z.uuid().safeParse((await params).bookingId);
  if (!id.success) return respond(400);
  try {
    const client = await createClient();
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user) return respond(401);
    const booking = await client
      .from("bookings")
      .select(
        "customer_id,booking_reference,motorcycle_model_id,start_at,end_at,total_centavos,deposit_required_centavos,status,created_at,is_test",
      )
      .eq("id", id.data)
      .maybeSingle();
    if (booking.error || !booking.data) return respond(404);
    const customer = await client
      .from("customers")
      .select("auth_user_id,email")
      .eq("id", booking.data.customer_id)
      .maybeSingle();
    if (customer.error || customer.data?.auth_user_id !== auth.data.user.id)
      return respond(404);
    if (process.env.RESEND_ENABLED !== "true")
      return Response.json(
        { delivery: "disabled" },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    // Entered contact details never establish ownership of a mailbox. Supabase must verify it on this same account.
    if (!auth.data.user.email_confirmed_at || !auth.data.user.email)
      return Response.json(
        {
          delivery: "verification_required",
          email: auth.data.user.email || customer.data!.email,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const { rpc, config } = notificationServer();
    if (
      !(await notificationReady(
        rpc,
        process.env.NOTIFICATION_REMINDERS_ENABLED === "true",
      ))
    )
      return Response.json(
        {
          error:
            "Notification database activation prerequisites are incomplete",
        },
        { status: 503 },
      );
    // Independent, bounded leases for the customer confirmation/request and administrator new-booking emails.
    for (let i = 0; i < 2; i++)
      if (
        (await dispatchOne(rpc, { ...config, bookingId: id.data })) === "idle"
      )
        break;
    return respond(204);
  } catch {
    return respond(503);
  }
}
