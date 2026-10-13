import { z } from "zod";
import { configuration, databaseClient, failure, loadCheckout, payloadHash, PaymentError, readBody, reconcile, respond, rpc, paymentRPC, verifySignature } from "@/lib/paymongo/test-payments";
const eventSchema = z.object({ data: z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9]+$/), type: z.literal("event"),
  attributes: z.object({ livemode: z.boolean(), type: z.string(), data: z.unknown() }),
}) });
const sessionHint = z.object({ id: z.string().regex(/^cs_[A-Za-z0-9]+$/), type: z.literal("checkout_session"),
  attributes: z.object({ reference_number: z.uuid(), livemode: z.boolean() }) });
export async function POST(request: Request) {
  try {
    // Drains existing payments even when new creation is switched off.
    const config = configuration();
    const raw = await readBody(request);
    if (!verifySignature(raw, request.headers.get("paymongo-signature"), config.webhook, Date.now(), config.live))
      throw new PaymentError(401, "Invalid webhook signature");
    const parsed = eventSchema.safeParse(JSON.parse(raw.toString("utf8")));
    if (!parsed.success || parsed.data.data.attributes.livemode !== config.live) throw new PaymentError(400, "Invalid payment event");
    const event = parsed.data.data;
    if (event.attributes.type !== "checkout_session.payment.paid") return respond({ ignored: true });
    const hint = sessionHint.safeParse(event.attributes.data);
    if (!hint.success || hint.data.attributes.livemode !== config.live) throw new PaymentError(400, "Invalid checkout event");
    const db = databaseClient();
    const args = { p_event_id: event.id, p_hash: payloadHash(raw) };
    if (await rpc<boolean>(db, paymentRPC("paymongo_test_event_completed"), args)) return respond({ duplicate: true });
    const checkout = await loadCheckout(db, hint.data.attributes.reference_number);
    // Payload is only a lookup hint. Retrieve with our test secret and validate
    // reference, amount, currency, payment status and mode before settlement.
    const result = await reconcile(db, checkout, hint.data.id);
    if (result.status !== "paid" && result.status !== "review_required")
      throw new PaymentError(503, "Paid event not yet reconciled; retry");
    await rpc(db, paymentRPC("paymongo_test_event_completed"), { ...args, p_complete: true });
    return respond({ ok: true });
  } catch (error) { return failure(error); }
}
