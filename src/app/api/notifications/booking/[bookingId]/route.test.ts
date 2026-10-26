vi.mock("@/lib/notifications/readiness", () => ({
  notificationReady: m.ready,
}));
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  booking: vi.fn(),
  customer: vi.fn(),
  dispatch: vi.fn(),
  server: vi.fn(),
  ready: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: m.auth },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: table === "bookings" ? m.booking : m.customer,
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/notifications/server", () => ({ notificationServer: m.server }));
vi.mock("@/lib/notifications/worker", () => ({ dispatchOne: m.dispatch }));
import { POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
function call(origin = "https://kjmride.com", bookingId = id) {
  return POST(
    new Request("https://kjmride.com/api/notifications/booking/" + bookingId, {
      method: "POST",
      headers: { origin },
    }),
    { params: Promise.resolve({ bookingId }) },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  m.ready.mockResolvedValue(true);
  vi.stubEnv("RESEND_ENABLED", "true");
  m.auth.mockResolvedValue({
    data: {
      user: {
        id: "owner",
        email: "owner@example.com",
        email_confirmed_at: "2030-01-01",
      },
    },
  });
  m.booking.mockResolvedValue({ data: { customer_id: "customer" } });
  m.customer.mockResolvedValue({
    data: { auth_user_id: "owner", email: "owner@example.com" },
  });
  m.server.mockReturnValue({ rpc: vi.fn(), config: { apiKey: "test" } });
  m.dispatch.mockResolvedValue("sent");
});
it("rejects cross-origin requests", async () => {
  expect((await call("https://other.test")).status).toBe(403);
  expect(m.auth).not.toHaveBeenCalled();
});
it("rejects invalid references", async () => {
  expect((await call(undefined, "bad")).status).toBe(400);
});
it("requires a signed-in customer", async () => {
  m.auth.mockResolvedValue({ data: { user: null } });
  expect((await call()).status).toBe(401);
  expect(m.server).not.toHaveBeenCalled();
});
it("cannot wake another customer's booking", async () => {
  m.customer.mockResolvedValue({ data: { auth_user_id: "someone-else" } });
  expect((await call()).status).toBe(404);
  expect(m.server).not.toHaveBeenCalled();
});
it("restricts both request deliveries to the owned booking", async () => {
  expect((await call()).status).toBe(204);
  expect(m.dispatch).toHaveBeenCalledTimes(2);
  expect(m.dispatch.mock.calls[0][1].bookingId).toBe(id);
});
it("stops on an empty queue", async () => {
  m.dispatch.mockResolvedValue("idle");
  await call();
  expect(m.dispatch).toHaveBeenCalledTimes(1);
});
it("remains disabled until configured", async () => {
  vi.stubEnv("RESEND_ENABLED", "false");
  expect((await call()).status).toBe(200);
  expect(m.server).not.toHaveBeenCalled();
});
it("returns no private error content", async () => {
  m.dispatch.mockRejectedValue(new Error("secret customer info"));
  const response = await call();
  expect(response.status).toBe(503);
  expect(await response.text()).toBe("");
});

it("does not dispatch an unverified guest address", async () => {
  m.auth.mockResolvedValue({
    data: { user: { id: "owner", is_anonymous: true } },
  });
  const response = await call();
  expect(await response.json()).toMatchObject({
    delivery: "verification_required",
  });
  expect(m.dispatch).not.toHaveBeenCalled();
});
it("uses verified account delivery without accepting a checkout recipient override", async () => {
  m.customer.mockResolvedValue({
    data: { auth_user_id: "owner", email: "other@example.com" },
  });
  expect((await call()).status).toBe(204);
  expect(m.dispatch).toHaveBeenCalled();
  expect(m.dispatch.mock.calls[0][1]).not.toHaveProperty("recipient");
});

it("cannot deliver before database security and activation are verified", async () => {
  m.ready.mockResolvedValue(false);
  expect((await call()).status).toBe(503);
  expect(m.dispatch).not.toHaveBeenCalled();
});
