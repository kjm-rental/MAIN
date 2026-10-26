import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  human: vi.fn(),
  hash: vi.fn(),
}));
vi.mock("@/lib/guest-checkout/server", () => ({
  guestDb: () => ({ rpc: mocks.rpc }),
  guestHash: mocks.hash,
  verifyHuman: mocks.human,
  sameOrigin: (r: Request) => r.headers.get("origin") === new URL(r.url).origin,
  guestResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
}));
import { POST } from "./route";
const payload = {
  p_idempotency_key: "11111111-1111-4111-8111-111111111111",
  p_model_id: "22222222-2222-4222-8222-222222222222",
  p_start_at: "2030-01-01T05:00:00.000Z",
  p_end_at: "2030-01-02T06:00:00.000Z",
  p_extra_items: [],
  p_full_name: "Guest Customer",
  p_email: "guest@example.com",
  p_phone: "+639171234567",
  p_country: "Philippines",
  p_customer_type: "philippine_resident",
  p_identity_name: "Guest Customer",
  p_license_name: "Guest Customer",
  p_license_country: "Philippines",
  p_license_expiration: "2031-01-01",
  p_vehicle_categories: "A",
  p_entry_date: null,
  p_privacy_consent: true,
  p_declaration: true,
  p_deposit_option: "cash",
  p_policy_version: "2026-01-01T00:00:00Z",
  p_document_type: null,
  captchaToken: "human",
};
const request = (body: unknown = payload, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/guest/bookings", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("KJM_LOCAL_BOOKING_DISABLED", "false");
  mocks.human.mockResolvedValue(true);
  mocks.hash.mockResolvedValue("a".repeat(64));
  mocks.rpc.mockResolvedValue({
    data: [{ booking_id: "new-booking" }],
    error: null,
  });
});
it("submits guests using server binding without Auth requirements or client totals", async () => {
  const response = await POST(request({ ...payload, total: 1 }));
  expect(response.status).toBe(200);
  const args = mocks.rpc.mock.calls[0][1];
  expect(args.p_payload.p_email).toBe("guest@example.com");
  expect(args.p_payload.total).toBeUndefined();
  expect(args.p_payload.captchaToken).toBeUndefined();
  expect(args.p_access_hash).toBe("a".repeat(64));
});
it("blocks cross-origin submissions", async () => {
  expect(
    (await POST(request(payload, "https://attacker.invalid"))).status,
  ).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("returns field validation without JSON or raw Zod errors", async () => {
  const response = await POST(request({ ...payload, p_email: "bad" }));
  const data = await response.json();
  expect(response.status).toBe(400);
  expect(data.fields.email).toBe("Please enter a valid email address.");
  expect(data.error).not.toContain("Zod");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("never creates records when the bot check fails", async () => {
  mocks.human.mockResolvedValue(false);
  expect((await POST(request())).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("never exposes database errors", async () => {
  mocks.rpc.mockResolvedValue({
    error: { message: "sensitive internal SQL details" },
    data: null,
  });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("SQL");
});
