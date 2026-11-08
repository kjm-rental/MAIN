import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  reconcile: vi.fn(),
  rpc: vi.fn(),
  provider: vi.fn(),
  resource: vi.fn(),
}));
vi.mock("./test-payments", async (original) => ({
  ...(await original<typeof import("./test-payments")>()),
  loadCheckout: mocks.load,
  reconcile: mocks.reconcile,
  rpc: mocks.rpc,
  provider: mocks.provider,
  providerResource: mocks.resource,
  providerRead: (resource: string, path: string) =>
    resource === "checkout_sessions"
      ? mocks.provider(path)
      : mocks.resource(resource, path),
}));
import { inlinePaymentState, qrImage } from "./inline-qrph";
import type { Checkout, PaymentDB } from "./test-payments";
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
const c: Checkout = {
  id: "11111111-1111-4111-8111-111111111111",
  booking_id: "22222222-2222-4222-8222-222222222222",
  customer_user_id: null,
  amount_centavos: 147000,
  currency: "PHP",
  is_test: false,
  checkout_session_id: "cs_inline123",
  provider_intent_id: "pi_inline123",
  qr_creation_claimed_at: null,
  checkout_deadline: "2099-01-01T00:00:00Z",
  creation_claimed_at: "2026-11-02T00:00:00Z",
  status: "session_created",
  reservation_active: true,
  booking_status: "pending",
};
function intent(attached = false) {
  return {
    id: c.provider_intent_id,
    type: "payment_intent",
    attributes: {
      amount: c.amount_centavos,
      currency: "PHP",
      livemode: true,
      status: attached ? "awaiting_next_action" : "awaiting_payment_method",
      client_key: "server_only_client_key",
      payments: [],
      next_action: attached
        ? { type: "consume_qr", code: { image_url: image } }
        : null,
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYMONGO_MODE", "live");
  vi.stubEnv("PAYMONGO_LIVE_SECRET_KEY", "sk_live_placeholder");
  vi.stubEnv("PAYMONGO_LIVE_WEBHOOK_SECRET", "webhook_placeholder_long");
  vi.stubEnv("PAYMONGO_LIVE_RECONCILIATION_SECRET", "x".repeat(32));
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://slevojynuumrvgiznmxk.supabase.co",
  );
  vi.stubEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    `test.${Buffer.from(JSON.stringify({ ref: "slevojynuumrvgiznmxk", role: "service_role" })).toString("base64url")}.synthetic`,
  );
  vi.stubEnv("PAYMONGO_APP_ORIGIN", "https://kjm.example");
  mocks.load.mockResolvedValue(c);
  mocks.reconcile.mockResolvedValue({ status: "pending", checkoutId: c.id });
  mocks.rpc.mockImplementation(
    async (_db, name) => name === "claim_paymongo_qr_generation",
  );
  mocks.resource.mockImplementation(async (resource, path) =>
    resource === "payment_methods"
      ? { id: "pm_inline123", type: "payment_method" }
      : intent(path.endsWith("/attach")),
  );
});
afterEach(() => vi.unstubAllEnvs());
it("refreshes an incomplete new session before binding its payment intent", async () => {
  const withoutIntent = { ...c, provider_intent_id: null };
  mocks.load
    .mockResolvedValueOnce(withoutIntent)
    .mockResolvedValueOnce(withoutIntent)
    .mockResolvedValue(c);
  const session = {
    id: c.checkout_session_id,
    type: "checkout_session",
    attributes: {
      livemode: true,
      reference_number: c.id,
      status: "active",
      line_items: [{ amount: c.amount_centavos, currency: "PHP", quantity: 1 }],
      payments: [],
      payment_intent: null as { id: string } | null,
    },
  };
  mocks.provider
    .mockResolvedValueOnce(session)
    .mockResolvedValueOnce({
      ...session,
      attributes: {
        ...session.attributes,
        payment_intent: { id: c.provider_intent_id! },
      },
    });
  const result = await inlinePaymentState({} as PaymentDB, withoutIntent, true);
  expect(result.qrImage).toBe(image);
  expect(mocks.provider).toHaveBeenCalledTimes(2);
  expect(mocks.rpc).toHaveBeenCalledWith(
    expect.anything(),
    "bind_paymongo_inline_intent",
    { p_checkout_id: c.id, p_intent_id: c.provider_intent_id },
  );
});
it("generates an inline QR for the saved amount without returning provider credentials or a redirect", async () => {
  const result = await inlinePaymentState({} as PaymentDB, c, true);
  expect(result).toMatchObject({
    status: "pending",
    bookingStatus: "pending",
    amountCentavos: 147000,
    qrImage: image,
  });
  expect(JSON.stringify(result)).not.toContain("server_only_client_key");
  expect(result).not.toHaveProperty("checkoutUrl");
  expect(mocks.resource).toHaveBeenCalledWith(
    "payment_intents",
    "/pi_inline123/attach",
    {
      data: {
        attributes: {
          payment_method: "pm_inline123",
          client_key: "server_only_client_key",
        },
      },
    },
  );
});
it("GET-style polling reuses a provider QR and never creates or attaches a payment method", async () => {
  mocks.resource.mockResolvedValue(intent(true));
  const result = await inlinePaymentState({} as PaymentDB, c);
  expect(result.qrImage).toBe(image);
  expect(mocks.resource).toHaveBeenCalledTimes(1);
  expect(
    mocks.rpc.mock.calls.some(
      (call) => call[1] === "claim_paymongo_qr_generation",
    ),
  ).toBe(false);
});
it("a concurrent loser does not generate another payment method", async () => {
  mocks.rpc.mockResolvedValue(false);
  await inlinePaymentState({} as PaymentDB, c, true);
  expect(mocks.resource).toHaveBeenCalledTimes(1);
});
it("rejects provider amount mismatches before any QR generation", async () => {
  const wrong = intent();
  wrong.attributes.amount = 1;
  mocks.resource.mockResolvedValue(wrong);
  await expect(inlinePaymentState({} as PaymentDB, c, true)).rejects.toThrow(
    "does not match",
  );
  expect(
    mocks.rpc.mock.calls.some(
      (call) => call[1] === "claim_paymongo_qr_generation",
    ),
  ).toBe(false);
});
it("never renders remote images, SVG, HTML or oversized data as a payment QR", () => {
  expect(qrImage(image)).toBe(image);
  for (const unsafe of [
    "https://example.com/qr.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "javascript:alert(1)",
    "data:image/png;base64," + "a".repeat(300000),
  ])
    expect(qrImage(unsafe)).toBeNull();
});
