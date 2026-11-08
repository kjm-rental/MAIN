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
import sharp from "sharp";
const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ bookingId: id }) };
const strokes = [
  [
    { x: 0.1, y: 0.2 },
    { x: 0.6, y: 0.8 },
  ],
];
const req = (
  signatureName: string | undefined = "Maria Santos",
  signatureStrokes: unknown = strokes,
) =>
  new Request(`http://localhost/api/guest/bookings/${id}/finalize`, {
    method: "POST",
    headers: { origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify({
      termsVersion: "2026-10-12",
      accepted: true,
      signatureName,
      signatureStrokes,
    }),
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
    expect(mocks.rpc).toHaveBeenCalledWith(
      "draw_and_finalize_guest_booking_request",
      {
        p_signature_name: "Maria Santos",
        p_signature_strokes: strokes,
        p_booking_id: id,
        p_access_hash: "hash",
        p_terms_version: "2026-10-12",
        p_terms_accepted: true,
      },
    );
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

it("requires a signature before finalizing or sending notifications", async () => {
  const response = await POST(req(""), context);
  expect(response.status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.after).not.toHaveBeenCalled();
});
it("saves a valid uploaded image through the atomic image finalization RPC", async () => {
  const image = await sharp(
    Buffer.from(
      '<svg width="100" height="40"><rect width="100" height="40" fill="white"/><path d="M5 30L30 5L50 25L90 10" stroke="black" fill="none"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const body = {
    signatureMethod: "uploaded",
    signatureName: "Maria Santos",
    signatureImage: `data:image/png;base64,${image.toString("base64")}`,
    termsVersion: "2026-10-12",
    accepted: true,
  };
  mocks.rpc.mockResolvedValue({
    data: [{ booking_status: "pending" }],
    error: null,
  });
  const response = await POST(
    new Request(`http://localhost/api/guest/bookings/${id}/finalize`, {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    context,
  );
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "upload_and_finalize_guest_booking_request",
    expect.objectContaining({
      p_signature_image: expect.any(String),
      p_signature_name: "Maria Santos",
    }),
  );
  expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_signature_strokes");
});

it.each([
  { drawing: [] },
  { drawing: null },
  {
    drawing: [
      [
        { x: 0.2, y: 0.2 },
        { x: 0.2, y: 0.2 },
      ],
    ],
  },
])(
  "rejects blank drawn signatures before saving: $drawing",
  async ({ drawing }) => {
    const response = await POST(req("Maria Santos", drawing), context);
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  },
);
