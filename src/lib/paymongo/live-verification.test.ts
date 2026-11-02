import { expect, it } from "vitest";
import { validateVerificationPayment, verificationName } from "./live-verification";
const reference = "KJM-LIVE-VERIFY-11111111-1111-4111-8111-111111111111";
function fixture() {
  return { id: "cs_verify123", type: "checkout_session", attributes: {
    livemode: true, reference_number: reference,
    line_items: [{ name: verificationName, amount: 1000, currency: "PHP", quantity: 1 }],
    payments: [{ id: "pay_verify123", type: "payment", attributes: { amount: 1000, currency: "PHP", livemode: true, status: "paid", refunds: [], disputed: false } }],
  } };
}
it("accepts only a provider-confirmed PHP10 verification payment", () => {
  expect(validateVerificationPayment(fixture(), "cs_verify123", reference)).toEqual({ verified: true, amountCentavos: 1000, paymentId: "pay_verify123" });
});
it("rejects mismatched identity, mode, amount, and unpaid or multiple payments", () => {
  expect(() => validateVerificationPayment(fixture(), "cs_other", reference)).toThrow();
  expect(() => validateVerificationPayment(fixture(), "cs_verify123", reference + "x")).toThrow();
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.attributes.livemode = false; },
    (f: ReturnType<typeof fixture>) => { f.attributes.line_items[0].amount = 900; },
    (f: ReturnType<typeof fixture>) => { f.attributes.payments[0].attributes.amount = 900; },
    (f: ReturnType<typeof fixture>) => { f.attributes.payments[0].attributes.status = "pending"; },
    (f: ReturnType<typeof fixture>) => { f.attributes.payments.push(f.attributes.payments[0]); },
    (f: ReturnType<typeof fixture>) => { f.attributes.payments[0].attributes.disputed = true; },
  ]) {
    const f = fixture(); mutate(f);
    expect(() => validateVerificationPayment(f, "cs_verify123", reference)).toThrow();
  }
});
