import { expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { screenDocuments, type ScreeningDocument } from "./document-prescreen";
const document = (kind: string, mime = "image/png"): ScreeningDocument => ({
  id: kind,
  document_kind: kind,
  mime_type: mime,
  size_bytes: 1000,
});
const input = {
  documents: [document("drivers_license_front"), document("government_id")],
  customerType: "local_resident",
  customerName: "Sample Person",
  identityName: "Sample Person",
  licenseName: "Sample Person",
  licenseExpiry: "2030-10-12",
  categories: "A",
  pickupAt: "2026-10-13T02:00:00Z",
  load: async () =>
    new Uint8Array(
      await sharp({
        create: { width: 900, height: 600, channels: 3, background: "white" },
      })
        .png()
        .toBuffer(),
    ),
};
const now = new Date("2026-10-13T00:00:00Z");
it("flags missing required IDs and ignores superseded uploads", async () => {
  const result = await screenDocuments(
    {
      ...input,
      documents: [{ ...document("government_id"), replaced_at: "2026-10-12" }],
    },
    now,
  );
  expect(result.status).toBe("failed");
  expect(
    result.checks.filter(
      (check) => check.detail === "Required upload is missing.",
    ),
  ).toHaveLength(2);
});
it("requires passport instead of government ID for international visitors", async () => {
  const result = await screenDocuments(
    { ...input, customerType: "international_visitor" },
    now,
  );
  expect(
    result.checks.find((check) => check.label === "passport")?.status,
  ).toBe("failed");
});
it("treats blank images as manual review and never invents OCR or age results", async () => {
  const result = await screenDocuments(input, now);
  expect(result.status).toBe("manual");
  expect(
    result.checks.find((check) => check.label.includes("file quality"))?.status,
  ).toBe("manual");
  expect(
    result.checks.find((check) => check.label.includes("minimum age"))?.status,
  ).toBe("manual");
  expect(JSON.stringify(result)).not.toContain("Sample Person");
});
it("decodes ordinary images but does not approve identity when file checks pass", async () => {
  const bytes = Buffer.alloc(900 * 600 * 3);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  const png = await sharp(bytes, {
    raw: { width: 900, height: 600, channels: 3 },
  })
    .png()
    .toBuffer();
  const result = await screenDocuments(
    { ...input, load: async () => new Uint8Array(png) },
    now,
  );
  expect(
    result.checks.some(
      (check) =>
        check.label.includes("file quality") && check.status === "passed",
    ),
  ).toBe(true);
  expect(result.status).toBe("manual");
});
it("flags expired declared licenses and treats mismatched names as manual review", async () => {
  const result = await screenDocuments(
    { ...input, licenseExpiry: "2026-10-12", licenseName: "Another Name" },
    now,
  );
  expect(result.status).toBe("failed");
  expect(
    result.checks.find((check) => check.label === "Declared names")?.status,
  ).toBe("manual");
  expect(
    result.checks.find((check) => check.label === "Declared license expiry")
      ?.status,
  ).toBe("failed");
});
it("keeps PDFs, unavailable storage, and malformed expiry under manual review", async () => {
  const load = vi.fn().mockRejectedValue(new Error("Private storage detail"));
  const result = await screenDocuments(
    {
      ...input,
      documents: [
        document("drivers_license_front", "application/pdf"),
        document("government_id"),
      ],
      licenseExpiry: "2030-99-99",
      load,
    },
    now,
  );
  expect(result.status).toBe("manual");
  expect(load).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toContain("Private storage detail");
});
it("compares OCR candidates without converting them into approval or a guessed age rule", async () => {
  const bytes = Buffer.alloc(900 * 600 * 3);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  const png = await sharp(bytes, {
    raw: { width: 900, height: 600, channels: 3 },
  })
    .png()
    .toBuffer();
  const ocr = vi.fn().mockResolvedValue({
    available: true,
    fields: {
      name: "Another Person",
      birthdate: "2000-01-15",
      expiry: "2020-01-01",
      categories: "A",
    },
    warnings: [],
  });
  const result = await screenDocuments(
    { ...input, load: async () => new Uint8Array(png), ocr },
    now,
  );
  expect(
    result.checks.find((check) => check.label.includes("OCR name"))?.status,
  ).toBe("manual");
  expect(
    result.checks.find((check) => check.label === "OCR license expiry")?.status,
  ).toBe("failed");
  expect(result.ocr[0].ageAtPickup).toBe(26);
  expect(
    result.ocr[0].warnings.some((warning) =>
      warning.includes("minimum-age policy"),
    ),
  ).toBe(true);
  expect(result.status).toBe("failed");
});

it("checks identity-document OCR expiry as well as license expiry", async () => {
  const bytes = Buffer.alloc(900 * 600 * 3);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  const png = await sharp(bytes, {
    raw: { width: 900, height: 600, channels: 3 },
  })
    .png()
    .toBuffer();
  const result = await screenDocuments(
    {
      ...input,
      documents: [document("government_id")],
      load: async () => new Uint8Array(png),
      ocr: async () => ({
        available: true,
        fields: { expiry: "2020-01-01" },
        warnings: [],
      }),
    },
    now,
  );
  expect(
    result.checks.find(
      (check) => check.label === "OCR identity document expiry",
    )?.status,
  ).toBe("failed");
});
