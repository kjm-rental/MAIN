import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  owned: vi.fn(),
  rpc: vi.fn(),
  after: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/guest-checkout/server", () => ({
  ownedGuestBooking: mocks.owned,
  sameOrigin: (r: Request) => r.headers.get("origin") === new URL(r.url).origin,
  guestResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
}));
vi.mock("@/lib/notifications/server", () => ({
  notificationServer: mocks.notify,
}));
vi.mock("@/lib/notifications/readiness", () => ({
  notificationReady: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/notifications/worker", () => ({
  dispatchOne: vi.fn().mockResolvedValue("idle"),
}));
import { POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ bookingId: id }) };
const req = () =>
  new Request(`http://localhost/api/guest/bookings/${id}/finalize`, {
    method: "POST",
    headers: { origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify({ termsVersion: "2026-10-12", accepted: true }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owned.mockResolvedValue({ db: { rpc: mocks.rpc }, hash: "hash" });
});
it.each(["pending", "confirmed"])(
  "returns saved %s status without guessing email status or requiring auth",
  async (status) => {
    mocks.rpc.mockResolvedValue({
      data: [{ booking_status: status, verification_status: "under_review" }],
      error: null,
    });
    const response = await POST(req(), context);
    expect(response.status).toBe(200);
    expect((await response.json()).booking_status).toBe(status);
    expect(mocks.rpc).toHaveBeenCalledWith("finalize_guest_booking_request", {
      p_booking_id: id,
      p_access_hash: "hash",
      p_terms_version: "2026-10-12",
      p_terms_accepted: true,
    });
    expect(mocks.after).toHaveBeenCalledTimes(1);
  },
);
it("denies a different browser before mutating or queuing email", async () => {
  mocks.owned.mockResolvedValue(null);
  expect((await POST(req(), context)).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.after).not.toHaveBeenCalled();
});
it("does not wake delivery when documents/terms/finalization fail", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { message: "private object missing" },
  });
  const response = await POST(req(), context);
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain("private object");
  expect(mocks.after).not.toHaveBeenCalled();
});
