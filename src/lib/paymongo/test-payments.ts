import { paymongoLiveMode } from "./mode";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supportedCheckoutMethods } from "./payment-methods";

export class PaymentError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
/** Reuse an existing live key in the original variable only with explicit live mode. */
export function paymongoSecret(live:boolean) {
  const legacy=process.env.PAYMONGO_SECRET_KEY;
  return live ? process.env.PAYMONGO_LIVE_SECRET_KEY ?? (legacy?.startsWith("sk_live_") ? legacy : undefined) : legacy;
}
export function configuration(creation = false) {
  const live = paymongoLiveMode();
  const secret = paymongoSecret(live);
  const webhook = live ? process.env.PAYMONGO_LIVE_WEBHOOK_SECRET : process.env.PAYMONGO_WEBHOOK_SECRET;
  const cron = live ? process.env.PAYMONGO_LIVE_RECONCILIATION_SECRET : process.env.PAYMONGO_RECONCILIATION_SECRET;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const database = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origin = process.env.PAYMONGO_APP_ORIGIN;
  // Explicit mode pins every endpoint to the corresponding database and key.
  // JWT claims prevent accidental cross-project legacy-key mixing;
  // Supabase itself authenticates the JWT signature on every RPC request.
  const testRef = live ? "slevojynuumrvgiznmxk" : "uuxjymzrtncrnnkvdpjy";
  let serviceMatches = false;
  try {
    const claims = JSON.parse(Buffer.from(service?.split(".")[1] ?? "", "base64url").toString());
    serviceMatches = claims.ref === testRef && claims.role === "service_role";
  } catch { /* fail closed */ }
  if ((creation && (live ? process.env.PAYMONGO_LIVE_ENABLED : process.env.PAYMONGO_TEST_ENABLED) !== "true") ||
      !secret?.startsWith(live ? "sk_live_" : "sk_test_") || !webhook || webhook.length < 16 ||
      !cron || cron.length < 32 || !service || !origin ||
      database !== `https://${testRef}.supabase.co` ||
      (!live && process.env.PAYMONGO_TEST_PROJECT_REF !== testRef) || !serviceMatches)
    throw new PaymentError(503, "Online payments are not ready");
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password)
    throw new PaymentError(503, "Online payments are not ready");
  return { secret, webhook, cron, service, database, origin, live };
}
export function databaseClient() {
  const c = configuration();
  return createClient(c.database, c.service, { auth: { persistSession: false, autoRefreshToken: false } });
}
export type PaymentDB = ReturnType<typeof databaseClient>;
export async function availableMethods() {
  const c = configuration(true);
  if (c.live && !await rpc<boolean>(databaseClient(), "paymongo_live_ready", {})) throw new PaymentError(503, "Online payments are not ready");
  if(c.live) {
    const options=await rpc<{qrph_enabled:boolean;qrph_ready:boolean}>(databaseClient(),"get_delivery_options",{});
    if(!options.qrph_enabled || !options.qrph_ready)throw new PaymentError(503,"QRPh is disabled or not verified");
  }
  const methods = await accountMethods();
  if (!c.live) return methods;
  const approved = await rpc<string[]>(databaseClient(), "paymongo_live_methods", {});
  return methods.filter(method => approved.includes(method));
}
// Read-only TEST-account capability preview. No database or booking access.
export async function accountMethods() {
  const live = paymongoLiveMode();
  const secret = paymongoSecret(live);
  if (!secret?.startsWith(live ? "sk_live_" : "sk_test_")) throw new PaymentError(503, "Online payments unavailable");
  const response = await fetch("https://api.paymongo.com/v1/merchants/capabilities/payment_methods", {
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}` },
  });
  if (!response.ok) throw new PaymentError(503, "Online payments unavailable");
  return supportedCheckoutMethods(await response.json());
}
export function paymentRPC(name: string) {
  return name.replace("paymongo_test", configuration().live ? "paymongo_live" : "paymongo_test");
}
export async function rpc<T>(db: PaymentDB, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await db.rpc(name, args);
  if (result.error) throw new PaymentError(503, "Payment database unavailable; retry reconciliation");
  return result.data as T;
}
export const checkoutSchema = z.object({
  id: z.uuid(), booking_id: z.uuid(), customer_user_id: z.uuid().nullable(),
  amount_centavos: z.number().int().positive().safe(), currency: z.literal("PHP"), is_test: z.boolean(),
  checkout_session_id: z.string().regex(/^cs_[A-Za-z0-9]+$/).nullable(),
  checkout_deadline: z.iso.datetime({ offset: true }), creation_claimed_at: z.string().nullable(),
  status: z.enum(["prepared", "session_created", "paid", "review_required"]),
  reservation_active: z.boolean().optional(),
});
export type Checkout = z.infer<typeof checkoutSchema>;
const paymentSchema = z.object({
  id: z.string().regex(/^pay_[A-Za-z0-9]+$/), type: z.literal("payment"),
  attributes: z.object({ amount: z.number().int().positive().safe(), currency: z.literal("PHP"),
    livemode: z.boolean(), status: z.string(), refunds: z.array(z.unknown()).optional(), disputed: z.boolean().optional() }),
});
export const sessionSchema = z.object({
  id: z.string().regex(/^cs_[A-Za-z0-9]+$/), type: z.literal("checkout_session"),
  attributes: z.object({ livemode: z.boolean(), reference_number: z.uuid(),
    checkout_url: z.string().optional(), status: z.string(),
    line_items: z.array(z.object({ amount: z.number().int().positive().safe(), currency: z.literal("PHP"), quantity: z.number().int().positive().safe() })),
    payments: z.array(paymentSchema),
  }),
});
export type Session = z.infer<typeof sessionSchema>;
export function validateSession(raw: unknown, c: Checkout): Session {
  const session = sessionSchema.parse(raw);
  const live = configuration().live;
  if (session.attributes.livemode !== live || session.attributes.payments.some(p => p.attributes.livemode !== live) || c.is_test === live) throw new PaymentError(409, "Payment environment mismatch");
  const total = session.attributes.line_items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  if (!Number.isSafeInteger(total) || total !== c.amount_centavos || session.attributes.reference_number !== c.id ||
      (c.checkout_session_id && c.checkout_session_id !== session.id))
    throw new PaymentError(409, "Session does not match locked test booking");
  return session;
}
export function checkoutURL(session: Session) {
  const url = new URL(session.attributes.checkout_url ?? "");
  if (url.protocol !== "https:" || url.hostname !== "checkout.paymongo.com" || url.port || url.username || url.password)
    throw new PaymentError(503, "Invalid checkout destination");
  return url.href;
}
export async function provider(path: string, body?: unknown): Promise<unknown> {
  const c = configuration();
  // Fixed provider host; never follow redirects with Authorization credentials.
  const response = await fetch(`https://api.paymongo.com/v1/checkout_sessions${path}`, {
    method: body === undefined ? "GET" : "POST", redirect: "error", cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${Buffer.from(`${c.secret}:`).toString("base64")}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new PaymentError(503, "PayMongo request unresolved; reconcile existing checkout");
  const json = await response.json();
  return json.data;
}
export async function loadCheckout(db: PaymentDB, id: string) {
  const raw = await rpc<unknown>(db, paymentRPC("read_paymongo_test_checkout"), { p_checkout_id: id });
  if (!raw) throw new PaymentError(404, "Test checkout unavailable");
  const checkout = checkoutSchema.parse(raw);
  if (checkout.is_test === configuration().live) throw new PaymentError(409, "Booking environment mismatch");
  return checkout;
}
// Monitoring never replaces receipt/ledger settlement and is optional before migration 039.
async function noteProviderStatus(db:PaymentDB,id:string,status:string) {
  if(!configuration().live)return;
  try { const result=await db.rpc("note_paymongo_provider_status",{p_checkout_id:id,p_status:status});
    if(result.error && !["PGRST202","42883"].includes(result.error.code)) console.error("PayMongo status visibility unavailable",{code:result.error.code});
  } catch { /* An unavailable status cache cannot undo a verified financial receipt. */ }
}
// Both webhook and cron use this authoritative retrieval, never return-URL data.
export async function reconcile(db: PaymentDB, c: Checkout, recoveredSession?: string) {
  if (recoveredSession && c.checkout_session_id && recoveredSession !== c.checkout_session_id)
    throw new PaymentError(409, "Session identity mismatch");
  const sessionID = c.checkout_session_id ?? recoveredSession;
  if (!sessionID) return { status: "creation_unresolved", checkoutId: c.id };
  if (!/^cs_[A-Za-z0-9]+$/.test(sessionID)) throw new PaymentError(400, "Invalid session");
  let session = validateSession(await provider(`/${sessionID}`), c);
  if (!c.checkout_session_id) {
    if (!c.creation_claimed_at) throw new PaymentError(409, "Session creation was never claimed");
    await rpc(db, paymentRPC("attach_paymongo_test_session"), { p_checkout_id: c.id, p_session_id: session.id });
  }
  let paid = session.attributes.payments.filter(p => p.attributes.status === "paid");
  if (!paid.length && (Date.now() >= Date.parse(c.checkout_deadline) || c.reservation_active !== true) && session.attributes.status !== "expired") {
    // Expiration races with payment: retrieve again, never treat expiration as proof of nonpayment.
    await provider(`/${session.id}/expire`, {});
    session = validateSession(await provider(`/${session.id}`), c);
    paid = session.attributes.payments.filter(p => p.attributes.status === "paid");
  }
  if (paid.length > 1) throw new PaymentError(409, "Multiple payments require test payment review");
  if (paid.length === 1) {
    const payment = paid[0];
    if (payment.attributes.amount !== c.amount_centavos || payment.attributes.disputed || payment.attributes.refunds?.length)
      throw new PaymentError(409, "Payment requires test payment review");
    const status = await rpc<string>(db, paymentRPC("settle_paymongo_test_checkout"), {
      p_session_id: session.id, p_payment_id: payment.id, p_amount_centavos: payment.attributes.amount,
      p_currency: payment.attributes.currency, p_livemode: payment.attributes.livemode,
    });
    await noteProviderStatus(db,c.id,status);
    return { status, checkoutId: c.id };
  }
  const state = session.attributes.status;
  const status = state === "expired" ? "expired_unpaid" : ["cancelled","canceled"].includes(state) ? "cancelled_unpaid" : session.attributes.payments.some(payment=>payment.attributes.status === "failed") ? "failed_unpaid" : "pending";
  await noteProviderStatus(db,c.id,status);
  return { status, checkoutId:c.id };
}
export async function createCheckout(db: PaymentDB, booking: string, owner: string | null, key: string, guestHash?: string) {
  configuration(true);
  const methods = (await availableMethods()).filter(method => !configuration().live || method === "qrph");
  if (!methods.length) throw new PaymentError(503, "Online payments unavailable");
  const c = checkoutSchema.parse(await rpc(db, guestHash ? "prepare_paymongo_guest_checkout" : paymentRPC("prepare_paymongo_test_checkout"), guestHash ? {
    p_booking_id: booking,p_access_hash:guestHash,p_idempotency_key:key,
  } : {p_booking_id: booking, p_owner: owner, p_idempotency_key: key}));
  const current = await loadCheckout(db, c.id);
  if (current.status === "paid" || current.status === "review_required") return { status: current.status, checkoutId: c.id };
  if (current.checkout_session_id) {
    const state = await reconcile(db, current);
    if (!["pending","failed_unpaid"].includes(state.status)) return state;
    const session = validateSession(await provider(`/${current.checkout_session_id}`), current);
    if (Date.now() >= Date.parse(current.checkout_deadline) || !current.reservation_active || session.attributes.status !== "active")
      throw new PaymentError(409, "Checkout no longer payable");
    return { ...state, checkoutUrl: checkoutURL(session) };
  }
  const won = await rpc<boolean>(db, paymentRPC("claim_paymongo_test_creation"), { p_checkout_id: c.id });
  if (!won) return { status: "creation_unresolved", checkoutId: c.id };
  const origin = configuration(true).origin;
  const returnURL = process.env.KJM_PAYMONGO_TEST === "true" && !configuration().live
    ? `${origin}/paymongo/return?bookingId=${c.booking_id}`
    : guestHash ? `${origin}/guest/booking/${c.booking_id}` : `${origin}/booking/status/${c.booking_id}`;
  // Never retry this POST, even after timeout or 4xx. Durable claim survives crashes.
  const session = validateSession(await provider("", { data: { attributes: {
    line_items: [{ name: configuration().live ? "KJM motorcycle rental" : "KJM TEST motorcycle rental", amount: c.amount_centavos, currency: "PHP", quantity: 1 }],
    payment_method_types: methods, reference_number: c.id,
    success_url: returnURL, cancel_url: returnURL, send_email_receipt: false,
  } } }), c);
  await rpc(db, paymentRPC("attach_paymongo_test_session"), { p_checkout_id: c.id, p_session_id: session.id });
  const fresh = await loadCheckout(db, c.id);
  if (!fresh.reservation_active || Date.now() >= Date.parse(fresh.checkout_deadline)) return reconcile(db, fresh);
  return { status: "pending", checkoutId: c.id, checkoutUrl: checkoutURL(session) };
}
export function verifySignature(raw: Buffer, header: string | null, secret: string, now = Date.now(), live = false) {
  if (!header || header.length > 512) return false;
  const fields = new Map<string, string>();
  for (const part of header.split(",")) {
    const [key, value, extra] = part.trim().split("=");
    if (!key || value === undefined || extra !== undefined || fields.has(key)) return false;
    fields.set(key, value);
  }
  const time = fields.get("t"); const test = fields.get(live ? "li" : "te");
  if (!time || !/^\d{10}$/.test(time) || !test || !/^[a-fA-F0-9]{64}$/.test(test) || fields.get(live ? "te" : "li") || Math.abs(now / 1000 - Number(time)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${time}.`).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(test, "hex"));
}
export const payloadHash = (raw: Buffer) => createHash("sha256").update(raw).digest("hex");
export function bearerMatches(header: string | null, secret: string) {
  const supplied = Buffer.from(header ?? ""); const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
export async function readBody(request: Request, max = 65536): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) throw new PaymentError(400, "Body required");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new PaymentError(413, "Body too large"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export function respond(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function failure(error: unknown) {
  return respond({ error: error instanceof PaymentError ? error.message : "Payment processing is temporarily unavailable" }, error instanceof PaymentError ? error.status : 503);
}
