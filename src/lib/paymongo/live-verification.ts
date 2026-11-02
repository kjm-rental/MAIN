import { z } from "zod";
import { PaymentError, provider } from "./test-payments";

export const verificationReference = /^KJM-LIVE-VERIFY-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const verificationName = "KJM live QRPh verification - PHP10 - not a rental";
const session = z.object({
  id: z.string().regex(/^cs_[A-Za-z0-9]+$/),
  type: z.literal("checkout_session"),
  attributes: z.object({
    livemode: z.literal(true),
    reference_number: z.string().regex(verificationReference),
    line_items: z.tuple([z.object({
      name: z.literal(verificationName), amount: z.literal(1000),
      currency: z.literal("PHP"), quantity: z.literal(1),
    })]),
    payments: z.tuple([z.object({
      id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
      type: z.literal("payment"),
      attributes: z.object({
        amount: z.literal(1000), currency: z.literal("PHP"),
        livemode: z.literal(true), status: z.literal("paid"),
        refunds: z.array(z.unknown()).max(0).optional(),
        disputed: z.literal(false).optional(),
      }),
    })]),
  }),
});

export function validateVerificationPayment(raw: unknown, sessionId: string, reference: string) {
  const parsed = session.safeParse(raw);
  if (!parsed.success || parsed.data.id !== sessionId || parsed.data.attributes.reference_number !== reference)
    throw new PaymentError(409, "Live verification payment is not confirmed");
  return { verified: true, amountCentavos: 1000, paymentId: parsed.data.attributes.payments[0].id };
}

// Called only after LIVE webhook signature verification. Never credits a rental,
// changes readiness flags, creates a checkout, or touches customer/booking records.
export async function verifyLivePayment(sessionId: string, reference: string) {
  return validateVerificationPayment(await provider(`/${sessionId}`), sessionId, reference);
}
