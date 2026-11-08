import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: { from: () => ({ uploadToSignedUrl: mocks.upload }) },
  }),
}));
import { uploadGuestDocument } from "./upload-document";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.upload.mockResolvedValue({ error: null });
});
it("sends only small JSON metadata through Next and uploads all 8MB directly to private storage", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        path: "guest/booking/path",
        token: "scoped",
        ticket: "signed-ticket",
      }),
    )
    .mockResolvedValueOnce(Response.json({ saved: true }));
  vi.stubGlobal("fetch", request);
  const file = new File([new Uint8Array(8_388_608)], "test.png", {
    type: "image/png",
  });
  await uploadGuestDocument("booking", "government_id", file);
  expect(mocks.upload).toHaveBeenCalledWith(
    "guest/booking/path",
    "scoped",
    file,
    { contentType: "image/png", upsert: false },
  );
  expect(request).toHaveBeenCalledTimes(2);
  for (const call of request.mock.calls)
    expect(call[1].body.length).toBeLessThan(1024);
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({
    action: "complete",
    ticket: "signed-ticket",
  });
});
it("preserves useful server error messages without starting a file upload", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "This booking has expired." }, { status: 409 }),
      ),
  );
  await expect(
    uploadGuestDocument(
      "booking",
      "government_id",
      new File(["test"], "test.png", { type: "image/png" }),
    ),
  ).rejects.toThrow("This booking has expired");
  expect(mocks.upload).not.toHaveBeenCalled();
});
