vi.mock("@/lib/document-ocr", () => ({ recognizeDocument: vi.fn() }));
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), screen: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/document-prescreen", () => ({ screenDocuments: mocks.screen }));
import { POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ bookingId: id }) };
const request = () =>
  new Request(`http://localhost/api/verification/${id}/prescreen`, {
    method: "POST",
  });
it("requires authentication before booking or storage access", async () => {
  const from = vi.fn();
  mocks.client.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from,
  });
  expect((await POST(request(), context)).status).toBe(401);
  expect(from).not.toHaveBeenCalled();
});
it("requires explicit booking ownership even if a booking row is readable", async () => {
  const storage = vi.fn();
  mocks.client.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: "owner" } }, error: null }),
    },
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data:
            table === "bookings"
              ? { customer_id: "customer", start_at: "2026-10-13" }
              : { auth_user_id: "other" },
          error: null,
        }),
      };
      return q;
    },
    storage,
  });
  expect((await POST(request(), context)).status).toBe(404);
  expect(storage).not.toHaveBeenCalled();
  expect(mocks.screen).not.toHaveBeenCalled();
});
it("rejects cross-origin requests without creating a client", async () => {
  mocks.client.mockClear();
  const req = new Request(request(), {
    headers: { origin: "https://other.example" },
  });
  expect((await POST(req, context)).status).toBe(403);
  expect(mocks.client).not.toHaveBeenCalled();
});
