import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkoutURL, configuration, createCheckout, type Checkout, type PaymentDB, reconcile, validateSession, verifySignature } from "./test-payments";

const id = "11111111-1111-4111-8111-111111111111";
const checkout: Checkout = {
  id, booking_id: id, customer_user_id: id, amount_centavos: 10000, currency: "PHP", is_test: true,
  checkout_session_id: "cs_test123", creation_claimed_at: "2026-01-01T00:00:00Z",
  checkout_deadline: "2099-01-01T00:00:00Z", status: "session_created", reservation_active: true,
};
const session = (paid = false) => ({ id: "cs_test123", type: "checkout_session", attributes: {
  livemode: false, reference_number: id, status: "active", checkout_url: "https://checkout.paymongo.com/cs_test123",
  line_items: [{ amount: 10000, currency: "PHP", quantity: 1 }],
  payments: paid ? [{ id: "pay_test123", type: "payment", attributes: { amount: 10000, currency: "PHP", livemode: false, status: "paid", refunds: [] } }] : [],
} });
function db(handler: (name: string, args: Record<string, unknown>) => unknown) {
  const call = vi.fn(async (name: string, args: Record<string, unknown>) => ({ data: handler(name, args), error: null }));
  return { client: { rpc: call } as unknown as PaymentDB, call };
}
const response = (value: unknown) => new Response(JSON.stringify({ data: value }), { status: 200 });
beforeEach(() => {
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_placeholder"); vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", "test_webhook_secret_123456");
  vi.stubEnv("PAYMONGO_RECONCILIATION_SECRET", "x".repeat(32)); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", `test.${Buffer.from(JSON.stringify({ ref: "uuxjymzrtncrnnkvdpjy", role: "service_role" })).toString("base64url")}.signature`);
  vi.stubEnv("PAYMONGO_TEST_PROJECT_REF", "uuxjymzrtncrnnkvdpjy");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://uuxjymzrtncrnnkvdpjy.supabase.co"); vi.stubEnv("PAYMONGO_APP_ORIGIN", "https://kjm.example");
  vi.stubEnv("PAYMONGO_TEST_ENABLED", "true");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("test payment safeguards", () => {
  it("requires separate LIVE credentials and production key binding; TEST cannot enter LIVE", () => {
    vi.stubEnv("PAYMONGO_MODE", "live");
    vi.stubEnv("PAYMONGO_LIVE_ENABLED", "true");
    vi.stubEnv("PAYMONGO_LIVE_SECRET_KEY", "sk_test_wrong_mode");
    vi.stubEnv("PAYMONGO_LIVE_WEBHOOK_SECRET", "live_mock_webhook_secret");
    vi.stubEnv("PAYMONGO_LIVE_RECONCILIATION_SECRET", "l".repeat(32));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://slevojynuumrvgiznmxk.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", `test.${Buffer.from(JSON.stringify({ ref: "slevojynuumrvgiznmxk", role: "service_role" })).toString("base64url")}.signature`);
    expect(() => configuration(true)).toThrow();
    vi.stubEnv("PAYMONGO_LIVE_SECRET_KEY", "sk_live_mock_only");
    expect(configuration(true).live).toBe(true);
    expect(() => validateSession(session(), checkout)).toThrow("environment mismatch");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://uuxjymzrtncrnnkvdpjy.supabase.co");
    expect(() => configuration(true)).toThrow();
  });
  it("validates LIVE signatures separately and rejects TEST signatures in LIVE", () => {
    const raw = Buffer.from("{}"); const time = 1800000000000;
    const digest = createHmac("sha256", "mock").update("1800000000.").update(raw).digest("hex");
    expect(verifySignature(raw, `t=1800000000,te=,li=${digest}`, "mock", time, true)).toBe(true);
    expect(verifySignature(raw, `t=1800000000,te=${digest},li=`, "mock", time, true)).toBe(false);
  });
  it("rejects live databases and mixed-project service keys even with a test PayMongo key", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://slevojynuumrvgiznmxk.supabase.co");
    expect(() => configuration()).toThrow();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://uuxjymzrtncrnnkvdpjy.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", `test.${Buffer.from(JSON.stringify({ ref: "slevojynuumrvgiznmxk", role: "service_role" })).toString("base64url")}.signature`);
    expect(() => configuration()).toThrow();
  });
  it("fails closed for live keys and disabled creation", () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_live_bad"); expect(() => configuration()).toThrow();
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_ok"); vi.stubEnv("PAYMONGO_TEST_ENABLED", "false");
    expect(() => configuration(true)).toThrow(); expect(() => configuration()).not.toThrow();
  });
  it("verifies exact raw bytes, test signature and freshness", () => {
    const raw = Buffer.from('{ "data": 1 }'); const now = 1800000000000; const secret = "secret";
    const digest = createHmac("sha256", secret).update("1800000000.").update(raw).digest("hex");
    const header = `t=1800000000,te=${digest},li=`;
    expect(verifySignature(raw, header, secret, now)).toBe(true);
    expect(verifySignature(Buffer.from('{"data":1}'), header, secret, now)).toBe(false);
    expect(verifySignature(raw, header, secret, now + 301000)).toBe(false);
    expect(verifySignature(raw, header + "bad", secret, now)).toBe(false);
    expect(verifySignature(raw, `t=1800000000,te=,li=${digest}`, secret, now)).toBe(false);
    expect(verifySignature(raw, header + ",te=" + digest, secret, now)).toBe(false);
  });
  it("rejects live sessions, wrong references, changed totals and unsafe redirects", () => {
    const live = session(); live.attributes.livemode = true; expect(() => validateSession(live, checkout)).toThrow();
    expect(() => validateSession(session(), { ...checkout, amount_centavos: 9999 })).toThrow();
    expect(() => validateSession(session(), { ...checkout, id: "22222222-2222-4222-8222-222222222222" })).toThrow();
    const s = validateSession(session(), checkout); s.attributes.checkout_url = "https://checkout.paymongo.com.evil.example/cs_test123";
    expect(() => checkoutURL(s)).toThrow();
  });
  it("does not create another session after a lost claim or interrupted POST", async () => {
    const c = { ...checkout, checkout_session_id: null, status: "prepared" };
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("/capabilities/")) return new Response(JSON.stringify(["qrph"]));
      throw new Error("network timeout");
    }); vi.stubGlobal("fetch", fetcher);
    const d = db(name => name === "claim_paymongo_test_creation" ? false : c);
    expect(await createCheckout(d.client, id, id, id)).toEqual({ status: "creation_unresolved", checkoutId: id });
    expect(fetcher.mock.calls.every(call => call[0].includes("/capabilities/"))).toBe(true);
    let claimed = false;
    const interrupted = db(name => name === "claim_paymongo_test_creation" ? (!claimed && (claimed = true)) : c);
    await expect(createCheckout(interrupted.client, id, id, id)).rejects.toThrow();
    expect((await createCheckout(interrupted.client, id, id, id)).status).toBe("creation_unresolved");
    expect(fetcher.mock.calls.filter(call => !call[0].includes("/capabilities/")).length).toBe(1);
  });
  it("settles only authoritative paid payments and recovers a claimed session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(session(true))));
    const d = db(name => name === "settle_paymongo_test_checkout" ? "paid" : null);
    expect((await reconcile(d.client, { ...checkout, checkout_session_id: null }, "cs_test123")).status).toBe("paid");
    expect(d.call.mock.calls.map(c => c[0])).toEqual(["attach_paymongo_test_session", "settle_paymongo_test_checkout"]);
    expect(d.call.mock.calls[1][1]).toMatchObject({ p_livemode: false, p_currency: "PHP", p_amount_centavos: 10000 });
  });
  it("retrieves again after expiry races and preserves late-payment review", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(session())).mockResolvedValueOnce(response(session()))
      .mockResolvedValueOnce(response(session(true))); vi.stubGlobal("fetch", fetcher);
    const d = db(() => "review_required");
    expect((await reconcile(d.client, { ...checkout, checkout_deadline: "2020-01-01T00:00:00Z" })).status).toBe("review_required");
    expect(fetcher.mock.calls[1][0]).toContain("/expire"); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("does not settle pending, multiple, refunded or mismatched payments", async () => {
    const d = db(() => "paid");
    const fetcher = vi.fn().mockResolvedValue(response(session())); vi.stubGlobal("fetch", fetcher);
    expect((await reconcile(d.client, checkout)).status).toBe("pending"); expect(d.call).not.toHaveBeenCalled();
    const double = session(true); double.attributes.payments.push({ ...double.attributes.payments[0], id: "pay_other" });
    fetcher.mockResolvedValue(response(double)); await expect(reconcile(d.client, checkout)).rejects.toThrow("Multiple");
    const wrong = session(true); wrong.attributes.payments[0].attributes.amount = 9999;
    fetcher.mockResolvedValue(response(wrong)); await expect(reconcile(d.client, checkout)).rejects.toThrow();
    await expect(reconcile(d.client, checkout, "cs_other")).rejects.toThrow("identity");
    expect(d.call).not.toHaveBeenCalled();
  });
  it("refunded provider payments require review; failed and expired payments never settle", async () => {
    const d = db(() => "paid");
    const refunded = JSON.parse(JSON.stringify(session(true)));
    refunded.attributes.payments[0].attributes.refunds = [{ id: "ref_synthetic" }];
    const fetcher = vi.fn().mockResolvedValue(response(refunded)); vi.stubGlobal("fetch", fetcher);
    await expect(reconcile(d.client, checkout)).rejects.toThrow("review");
    const failed = session(true); failed.attributes.payments[0].attributes.status = "failed";
    fetcher.mockResolvedValue(response(failed)); expect((await reconcile(d.client, checkout)).status).toBe("pending");
    const expired = session(); expired.attributes.status = "expired";
    fetcher.mockResolvedValue(response(expired)); expect((await reconcile(d.client, checkout)).status).toBe("expired_unpaid");
    expect(d.call).not.toHaveBeenCalled();
  });
});
