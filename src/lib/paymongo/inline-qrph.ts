import { z } from "zod";
import {
  type Checkout, type PaymentDB, PaymentError, createCheckout, loadCheckout,
  provider, providerResource, reconcile, rpc, validateIntent, validateSession,
} from "./test-payments";

export function qrImage(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300000) return null;
  if (/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value)) return value;
  return null;
}
export async function inlinePaymentState(db: PaymentDB, initial: Checkout, generate = false) {
  const state = await reconcile(db, initial);
  let c = await loadCheckout(db, initial.id);
  if (state.status === "pending" || state.status === "failed_unpaid") {
    await rpc(db, "mark_paymongo_live_awaiting_payment", { p_checkout_id: c.id });
    c = await loadCheckout(db, c.id);
  }
  const base = { ...state, qrImage: null as string | null, bookingStatus: c.booking_status, amountCentavos: c.amount_centavos, expiresAt: c.checkout_deadline };
  if (state.status === "paid" || state.status === "review_required") return base;
  if (!c.reservation_active || Date.parse(c.checkout_deadline) <= Date.now()) return base;
  if (!c.provider_intent_id) {
    if (!generate || !c.checkout_session_id) return base;
    const session = validateSession(await provider(`/${c.checkout_session_id}`), c);
    const id = session.attributes.payment_intent?.id;
    if (!id) throw new PaymentError(503, "The payment code is being prepared. Please check again.");
    await rpc(db, "bind_paymongo_inline_intent", { p_checkout_id: c.id, p_intent_id: id });
    c = await loadCheckout(db, c.id);
  }
  let intent = validateIntent(await providerResource("payment_intents", `/${c.provider_intent_id}`), c);
  if (intent.attributes.status === "succeeded") {
    const result = await reconcile(db, c);
    const fresh = await loadCheckout(db, c.id);
    return { ...base, ...result, bookingStatus: fresh.booking_status };
  }
  let image = qrImage(intent.attributes.next_action?.code?.image_url);
  if (!image && generate) {
    if (intent.attributes.status !== "awaiting_payment_method") return { ...base, bookingStatus: c.booking_status, status: "pending", qrImage: null };
    const seconds = Math.floor((Date.parse(c.checkout_deadline) - Date.now()) / 1000);
    if (seconds < 60) throw new PaymentError(409, "This payment window has ended. Please contact KJM before starting another payment.");
    if (!intent.attributes.client_key) throw new PaymentError(503, "Payment code could not be prepared.");
    const claimed = await rpc<boolean>(db, "claim_paymongo_qr_generation", { p_checkout_id: c.id });
    if (claimed) {
      const method = z.object({ id: z.string().regex(/^pm_[A-Za-z0-9]+$/), type: z.literal("payment_method") }).parse(
        await providerResource("payment_methods", "", { data: { attributes: { type: "qrph", expiry_seconds: Math.min(seconds, 1800) } } }),
      );
      intent = validateIntent(await providerResource("payment_intents", `/${intent.id}/attach`, {
        data: { attributes: { payment_method: method.id, client_key: intent.attributes.client_key } },
      }), c);
      image = qrImage(intent.attributes.next_action?.code?.image_url);
    }
  }
  return { ...base, bookingStatus: c.booking_status, status: "pending", qrImage: image };
}
export async function createInlineGuestPayment(db: PaymentDB, bookingId: string, accessHash: string) {
  const result = await createCheckout(db, bookingId, null, bookingId, accessHash);
  const c = await loadCheckout(db, result.checkoutId);
  return inlinePaymentState(db, c, true);
}
