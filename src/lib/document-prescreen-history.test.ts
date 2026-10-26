import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
import { recordDocumentPrescreen } from "./document-prescreen-history";
const input = {
  bookingId: "11111111-1111-4111-8111-111111111111",
  ownerId: "22222222-2222-4222-8222-222222222222",
  documentIds: ["33333333-3333-4333-8333-333333333333"],
  result: {
    status: "manual" as const,
    riskLevel: 2 as const,
    riskStatus: "MANUAL_REVIEW_REQUIRED" as const,
    reviewReasons: ["Manual name comparison required"],
    identityReviewRequired: true as const,
    preliminaryStatus: "manual_review_required" as const,
    checkedAt: "2026-10-23T01:00:00Z",
    checks: [
      {
        label: "OCR name",
        status: "manual" as const,
        detail: "Manual comparison required.",
      },
    ],
    corrections: [],
    ocr: [
      {
        documentKind: "passport",
        available: true,
        fields: {
          name: "PRIVATE PERSON",
          birthdate: "2000-01-15",
          documentNumberHash: "PRIVATE TOKEN",
        },
        warnings: [],
      },
    ],
  },
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("appends only redacted server results bound to the checked document snapshot", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-server-key");
  mocks.create.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  expect(await recordDocumentPrescreen(input)).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "record_verification_prescreen",
    expect.objectContaining({
      p_booking_id: input.bookingId,
      p_owner_id: input.ownerId,
      p_document_ids: input.documentIds,
    }),
  );
  const serialized = JSON.stringify(mocks.rpc.mock.calls[0]);
  expect(serialized).not.toContain("PRIVATE");
  expect(serialized).not.toContain("2000-01-15");
  expect(serialized).not.toContain("synthetic-server-key");
  expect(serialized).not.toContain("approved");
});
it("never substitutes customer credentials if server authorization is absent", async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  expect(await recordDocumentPrescreen(input)).toBe(false);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("reports unavailable history rather than pretending an unapplied RPC or stale snapshot saved", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-server-key");
  mocks.create.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc
    .mockResolvedValueOnce({ data: false, error: null })
    .mockResolvedValueOnce({
      data: null,
      error: { message: "RPC not installed" },
    });
  expect(await recordDocumentPrescreen(input)).toBe(false);
  expect(await recordDocumentPrescreen(input)).toBe(false);
});
