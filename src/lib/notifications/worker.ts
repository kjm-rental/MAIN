import { bookingTestAttempt } from "./booking-test";
import { createHash } from "node:crypto";
import { z } from "zod";
import { BRAND, connected, render } from "./templates";

export type RPC = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown>;
const rowSchema = z.object({
  id: z.uuid(),
  lease_token: z.uuid(),
  event_type: z.string(),
  recipient_reference: z.string(),
  payload: z.unknown(),
  is_test: z.boolean(),
  simulated: z.boolean(),
  template_version: z.literal(1),
  attempt_count: z.number().int(),
});
export type WorkerConfig = {
  apiKey: string;
  testRecipient?: string;
  review?: string;
  admin?: string;
  app?: string;
  bookingId?: string;
};
const email = z.email();
export async function dispatchOne(
  rpc: RPC,
  config: WorkerConfig,
  transport: typeof fetch = fetch,
) {
  const rows = z.array(rowSchema).parse(
    await rpc(
      config.bookingId ? "notification_claim_booking" : "notification_claim",
      {
        p_channel: "resend",
        p_mock: false,
        ...(config.bookingId ? { p_booking: config.bookingId } : {}),
      },
    ),
  );
  if (!rows.length) return "idle";
  const n = rows[0];
  const finish = async (result: string, provider: string | null = null) => {
    await rpc("notification_finish", {
      p_id: n.id,
      p_lease: n.lease_token,
      p_result: result,
      p_provider_reference: provider,
      p_retry_seconds: Math.min(3600, 60 * 2 ** n.attempt_count),
    });
    return result;
  };
  // Reconcile a controlled local confirmation instead of sending it again when normal delivery is later enabled.
  if (n.event_type === "booking_approved" && !n.is_test) {
    const prior = await bookingTestAttempt();
    const booking = z.object({ bookingId: z.uuid() }).safeParse(n.payload);
    if (prior && booking.success && prior.bookingId === booking.data.bookingId)
      return finish(
        prior.state === "sent" ? "sent" : "delivery_ambiguous",
        prior.provider ?? null,
      );
  }
  const template = Object.hasOwn(connected, n.event_type)
    ? connected[n.event_type]
    : undefined;
  if (!template || n.simulated) return finish("unsupported_template");
  let rendered;
  try {
    rendered = render(template, n.payload, config);
  } catch {
    return finish("unsupported_template");
  }
  const context = z.object({ recipient: z.string().nullable() }).parse(
    await rpc("notification_delivery_context", {
      p_id: n.id,
      p_lease: n.lease_token,
    }),
  );
  if (!email.safeParse(context.recipient).success)
    return finish("invalid_recipient");
  const admin = template.startsWith("admin_");
  if (
    admin !== (n.recipient_reference === "operations") ||
    (admin && context.recipient !== BRAND.admin)
  )
    return finish("invalid_recipient");
  // Synthetic rows can never target real customer/admin recipients.
  if (n.is_test && !email.safeParse(config.testRecipient).success)
    return finish("configuration");
  const recipient = n.is_test ? config.testRecipient! : context.recipient!;
  const body = {
    from: BRAND.from,
    to: [recipient],
    reply_to: BRAND.reply,
    ...rendered,
  };
  const serialized = JSON.stringify(body);
  const hash = createHash("sha256").update(serialized).digest("hex");
  const prepared = await rpc("notification_prepare", {
    p_id: n.id,
    p_lease: n.lease_token,
    p_hash: hash,
  });
  if (!prepared) return "cancelled";
  const checked = z
    .object({ recipient: z.string(), simulated: z.boolean() })
    .parse(prepared);
  // Recipient changes between lookup and final eligibility check must never leak mail.
  if (checked.simulated || checked.recipient !== context.recipient)
    return finish("request_changed");
  let response: Response;
  try {
    response = await transport("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `kjm/${n.id}/v1`,
      },
      body: serialized,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return finish("transient");
  }
  if (response.status === 429) return finish("rate_limited");
  if (response.status >= 500) return finish("transient");
  if (!response.ok)
    return finish(
      response.status === 409
        ? "request_changed"
        : [401, 403].includes(response.status)
          ? "configuration"
          : "provider_rejected",
    );
  let id: string;
  try {
    id = z
      .object({ id: z.string().min(1).max(128) })
      .parse(await response.json()).id;
  } catch {
    return finish("delivery_ambiguous");
  }
  return finish("sent", id);
}
