import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  owned: vi.fn(),
  create: vi.fn(),
  config: vi.fn(),
}));
vi.mock("@/lib/payment-availability", () => ({
  customerOnlinePaymentsEnabled: true,
}));
vi.mock("@/lib/guest-checkout/server", () => ({
  ownedGuestBooking: m.owned,
  sameOrigin: (r: Request) =>
    r.headers.get("origin") === "http://localhost:3000",
  guestResponse: (d: unknown, status = 200) => Response.json(d, { status }),
}));
vi.mock("@/lib/paymongo/test-payments", async (original) => ({
  ...(await original<typeof import("@/lib/paymongo/test-payments")>()),
  configuration: m.config,
  createCheckout: m.create,
  databaseClient: () => ({ synthetic: true }),
}));
import { POST } from "./route";
const id = "10000000-0000-4000-8000-000000000001",
  params = { params: Promise.resolve({ bookingId: id }) };
const request = (origin = "http://localhost:3000") =>
  new Request(`http://localhost:3000/api/guest/bookings/${id}/payment`, {
    method: "POST",
    headers: { origin },
    body: JSON.stringify({ amount: 1, status: "paid" }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYMONGO_MODE", "live");
  m.owned.mockResolvedValue({ hash: "booking-cookie-hash" });
  m.create.mockResolvedValue({
    status: "pending",
    checkoutUrl: "https://checkout.paymongo.com/synthetic",
  });
});
it("uses guest cookie and stable booking key with no browser amount/status or account", async () => {
  const r = await POST(request(), params);
  expect(r.status).toBe(200);
  expect(m.create).toHaveBeenCalledWith(
    { synthetic: true },
    id,
    null,
    id,
    "booking-cookie-hash",
  );
});
it("denies unauthorized guest before provider request", async () => {
  m.owned.mockResolvedValue(null);
  expect((await POST(request(), params)).status).toBe(404);
  expect(m.create).not.toHaveBeenCalled();
});
it("does not allow cross-origin creation", async () => {
  expect((await POST(request("https://other.example"), params)).status).toBe(
    403,
  );
  expect(m.create).not.toHaveBeenCalled();
});
it("never uses test credentials for customer QRPh", async () => {
  vi.stubEnv("PAYMONGO_MODE", "test");
  expect((await POST(request(), params)).status).toBe(503);
  expect(m.create).not.toHaveBeenCalled();
});
