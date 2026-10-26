import { customerOnlinePaymentsEnabled } from "@/lib/payment-availability";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  configuration,
  createCheckout,
  databaseClient,
  failure,
  readBody,
  respond,
  PaymentError,
} from "@/lib/paymongo/test-payments";
const input = z
  .object({ bookingId: z.uuid(), idempotencyKey: z.uuid() })
  .strict();
export async function POST(request: Request) {
  try {
    if (!customerOnlinePaymentsEnabled)
      throw new PaymentError(
        503,
        "Online payments are temporarily unavailable. Please choose Cash on Pickup.",
      );
    const config = configuration(true);
    const origin = request.headers.get("origin");
    const localTest =
      process.env.KJM_PAYMONGO_TEST === "true" &&
      ["http://localhost:3000", "http://127.0.0.1:3000"].includes(origin ?? "");
    if (origin !== config.origin && !localTest)
      throw new PaymentError(403, "Forbidden");
    const client = await createClient();
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user)
      throw new PaymentError(401, "Sign in required");
    const parsed = input.safeParse(
      JSON.parse((await readBody(request, 2048)).toString("utf8")),
    );
    if (!parsed.success) throw new PaymentError(400, "Invalid request");
    // RPC checks authenticated owner, test provenance and reserved booking atomically.
    return respond(
      await createCheckout(
        databaseClient(),
        parsed.data.bookingId,
        auth.data.user.id,
        parsed.data.idempotencyKey,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
