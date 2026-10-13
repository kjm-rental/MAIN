import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), reconcile: vi.fn(), loadCheckout: vi.fn() }));
vi.mock("@/lib/paymongo/test-payments", async (original) => {
  const actual = await original<typeof import("@/lib/paymongo/test-payments")>();
  return { ...actual, databaseClient: () => ({}), rpc: mocks.rpc, reconcile: mocks.reconcile, loadCheckout: mocks.loadCheckout };
});
import { POST } from "./route";
const secret = "test_webhook_secret_123456";
const id = "11111111-1111-4111-8111-111111111111";
function request(live = false, signature = true) {
  const raw = JSON.stringify({ data: { id: "evt_test123", type: "event", attributes: {
    livemode: live, type: "checkout_session.payment.paid", data: { id: "cs_test123", type: "checkout_session", attributes: { livemode: live, reference_number: id } },
  } } });
  const time = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", secret).update(`${time}.${raw}`).digest("hex");
  return new Request("https://kjm.example/api/paymongo/webhook", { method: "POST", body: raw,
    headers: { "paymongo-signature": signature ? `t=${time},te=${digest},li=` : "bad" } });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_placeholder"); vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", secret);
  vi.stubEnv("PAYMONGO_RECONCILIATION_SECRET", "x".repeat(32)); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", `test.${Buffer.from(JSON.stringify({ ref: "uuxjymzrtncrnnkvdpjy", role: "service_role" })).toString("base64url")}.signature`);
  vi.stubEnv("PAYMONGO_TEST_PROJECT_REF", "uuxjymzrtncrnnkvdpjy");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://uuxjymzrtncrnnkvdpjy.supabase.co"); vi.stubEnv("PAYMONGO_APP_ORIGIN", "https://kjm.example");
  vi.stubEnv("PAYMONGO_TEST_ENABLED", "false");
  mocks.loadCheckout.mockResolvedValue({ id }); mocks.reconcile.mockResolvedValue({ status: "paid" });
  mocks.rpc.mockResolvedValue(false);
});
afterEach(() => vi.unstubAllEnvs());
it("rejects unauthenticated or live webhook payloads before database access", async () => {
  expect((await POST(request(false, false))).status).toBe(401);
  expect((await POST(request(true))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled();
});
it("skips completed duplicate events", async () => {
  mocks.rpc.mockResolvedValue(true);
  expect((await POST(request())).status).toBe(200);
  expect(mocks.reconcile).not.toHaveBeenCalled(); expect(mocks.loadCheckout).not.toHaveBeenCalled();
});
it("marks completion only after settlement; retries failures", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mocks.rpc).toHaveBeenLastCalledWith({}, "paymongo_test_event_completed", expect.objectContaining({ p_complete: true }));
  vi.clearAllMocks(); mocks.rpc.mockResolvedValue(false); mocks.reconcile.mockRejectedValue(new Error("interrupted"));
  expect((await POST(request())).status).toBe(503);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
