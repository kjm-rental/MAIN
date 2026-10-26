vi.mock("@/lib/guest-checkout/server", () => ({
  ownedGuestBooking: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/document-prescreen-history", () => ({
  recordDocumentPrescreen: vi.fn().mockResolvedValue(false),
}));
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

it("returns only an advisory summary and ignores forged client approval data", async () => {
  const rpc = vi.fn(),
    update = vi.fn(),
    insert = vi.fn();
  mocks.client.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: "owner" } }, error: null }),
    },
    rpc,
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        order: () => q,
        update,
        insert,
        maybeSingle: async () => ({
          data:
            table === "bookings"
              ? { customer_id: "customer", start_at: "2026-10-24T01:00:00Z" }
              : table === "customers"
                ? { auth_user_id: "owner", full_name: "Sample Person" }
                : {
                    customer_type: "philippine_resident",
                    identity_name: "Sample Person",
                    license_name: "Sample Person",
                    license_expiration_date: "2030-01-01",
                    permitted_vehicle_categories: "A",
                  },
          error: null,
        }),
        limit: async () => ({ data: [], error: null }),
      };
      return q;
    },
  });
  mocks.screen.mockResolvedValue({
    status: "manual",
    preliminaryStatus: "manual_review_required",
    corrections: [],
    checkedAt: "2026-10-23T01:00:00Z",
    checks: [{ detail: "PRIVATE CHECK" }],
    ocr: [{ fields: { name: "PRIVATE NAME" } }],
  });
  const response = await POST(
    new Request(request(), {
      body: JSON.stringify({
        overall_status: "approved",
        status: "passed",
        checks: [],
      }),
    }),
    context,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    identityApproved: false,
    historyRecorded: false,
    status: "manual",
    preliminaryStatus: "manual_review_required",
    corrections: [],
    checkedAt: "2026-10-23T01:00:00Z",
  });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(rpc).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
});
