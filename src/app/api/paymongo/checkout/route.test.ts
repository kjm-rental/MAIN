import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  config: vi.fn(),
  checkout: vi.fn(),
  database: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.auth }));
vi.mock("@/lib/paymongo/test-payments", async (original) => ({
  ...(await original<typeof import("@/lib/paymongo/test-payments")>()),
  configuration: mocks.config,
  createCheckout: mocks.checkout,
  databaseClient: mocks.database,
}));
import { POST } from "./route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it.each(["test", "live"])(
  "blocks direct and stale checkout requests even with %s payments configured",
  async (mode) => {
    vi.stubEnv("PAYMONGO_MODE", mode);
    vi.stubEnv("PAYMONGO_TEST_ENABLED", "true");
    vi.stubEnv("PAYMONGO_LIVE_ENABLED", "true");
    const response = await POST(
      new Request("https://kjm.example/api/paymongo/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://kjm.example",
          Cookie: "existing-booking-session",
        },
        body: JSON.stringify({
          bookingId: "11111111-1111-4111-8111-111111111111",
          idempotencyKey: "22222222-2222-4222-8222-222222222222",
        }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error:
        "Online payments are temporarily unavailable. Please choose Cash on Pickup.",
    });
    for (const mock of Object.values(mocks))
      expect(mock).not.toHaveBeenCalled();
  },
);
