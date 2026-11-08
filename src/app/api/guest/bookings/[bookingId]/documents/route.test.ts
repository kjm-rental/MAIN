import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  owned: vi.fn(),
  signed: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/guest-checkout/server", () => ({
  ownedGuestBooking: mocks.owned,
  sameOrigin: (r: Request) => r.headers.get("origin") === new URL(r.url).origin,
  guestResponse: (v: unknown, status = 200) => Response.json(v, { status }),
}));
import { POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111",
  context = { params: Promise.resolve({ bookingId: id }) };
const request = (body: unknown, origin = "http://localhost") =>
  new Request(`http://localhost/api/guest/bookings/${id}/documents`, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
  mocks.from.mockImplementation(() => {
    const q = {
      select: () => q,
      eq: () => q,
      single: async () => ({
        data: {
          status: "pending",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        error: null,
      }),
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return q;
  });
  mocks.owned.mockResolvedValue({
    hash: "browser",
    db: {
      from: mocks.from,
      rpc: mocks.rpc,
      storage: { from: () => ({ createSignedUploadUrl: mocks.signed }) },
    },
  });
  mocks.signed.mockResolvedValue({
    data: { token: "one-path-token" },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ data: "saved-id", error: null });
});
it("authorizes an 8MB direct upload with only a tiny JSON request and verifies completion", async () => {
  const response = await POST(
    request({
      action: "prepare",
      kind: "government_id",
      mimeType: "image/jpeg",
      size: 8_388_608,
    }),
    context,
  );
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.path).toMatch(new RegExp(`^guest/${id}/`));
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(
    (await POST(request({ action: "complete", ticket: data.ticket }), context))
      .status,
  ).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "register_guest_verification_document",
    expect.objectContaining({
      p_storage_path: data.path,
      p_size_bytes: 8_388_608,
      p_access_hash: "browser",
    }),
  );
});
it("denies forged tickets, foreign origins, absent ownership and unsupported files", async () => {
  expect(
    (await POST(request({ action: "complete", ticket: "fake" }), context))
      .status,
  ).toBe(400);
  expect(
    (await POST(request({}, "https://elsewhere.test"), context)).status,
  ).toBe(403);
  expect(
    (
      await POST(
        request({
          action: "prepare",
          kind: "government_id",
          mimeType: "text/html",
          size: 10,
        }),
        context,
      )
    ).status,
  ).toBe(400);
  mocks.owned.mockResolvedValue(null);
  expect((await POST(request({}), context)).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.signed).not.toHaveBeenCalled();
});
