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

it("keeps even matching high-confidence OCR and good images in review until genuine identity checks exist", async () => {
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
      customerType: "philippine_resident",
      load: async () => new Uint8Array(png),
      ocr: async () => ({
        available: true,
        fields: {
          name: "Sample Person",
          birthdate: "2000-01-15",
          expiry: input.licenseExpiry,
          categories: "A",
        },
        warnings: [],
      }),
    },
    now,
  );
  expect(
    result.checks
      .filter((check) => check.label.includes("OCR name"))
      .every((check) => check.status === "passed"),
  ).toBe(true);
  expect(
    result.checks.find((check) => check.label === "OCR license expiry")?.status,
  ).toBe("passed");
  expect(
    result.checks.find((check) => check.label === "OCR license categories")
      ?.status,
  ).toBe("passed");
  expect(result.status).toBe("manual");
  expect(
    result.ocr.every((entry) =>
      entry.warnings.some((w) => w.includes("manual review")),
    ),
  ).toBe(true);
});

async function readableImage() {
  const bytes = Buffer.alloc(900 * 600 * 3);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  return new Uint8Array(
    await sharp(bytes, { raw: { width: 900, height: 600, channels: 3 } })
      .png()
      .toBuffer(),
  );
}
it("separates preliminary success from genuine approval", async () => {
  const image = await readableImage();
  const result = await screenDocuments(
    {
      ...input,
      load: async () => image,
      ocr: async () => ({
        available: true,
        fields: {
          name: input.customerName,
          birthdate: "2000-01-15",
          expiry: input.licenseExpiry,
          categories: "A",
          documentNumberHash: "synthetic-only",
        },
        warnings: [],
      }),
    },
    now,
  );
  expect(result.preliminaryStatus).toBe("passed");
  expect(result.riskLevel).toBe(1);
  expect(result.riskStatus).toBe("DOCUMENT_CHECKS_PASSED");
  expect(result.identityReviewRequired).toBe(true);
  expect(result.status).toBe("manual");
  expect(result.corrections).toEqual([]);
});
it("requests a missing document and flags unreadable files without inventing OCR", async () => {
  const result = await screenDocuments(
    { ...input, documents: [document("government_id")] },
    now,
  );
  expect(result.preliminaryStatus).toBe("correction_required");
  expect(result.corrections).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ documentKind: "drivers_license_front" }),
      expect.objectContaining({
        documentKind: "government_id",
        message: expect.stringContaining("clearer"),
      }),
    ]),
  );
});
it("compares birthdates across documents and matching license sides only", async () => {
  const image = await readableImage();
  let calls = 0;
  const result = await screenDocuments(
    {
      ...input,
      documents: [
        document("drivers_license_front"),
        document("drivers_license_back"),
        document("government_id"),
      ],
      load: async () => image,
      ocr: async () => ({
        available: true,
        fields: {
          name: input.customerName,
          birthdate: ++calls === 3 ? "1999-01-15" : "2000-01-15",
          expiry: input.licenseExpiry,
          categories: "A",
          documentNumberHash:
            calls === 2 ? "different-license" : "synthetic-license",
        },
        warnings: [],
      }),
    },
    now,
  );
  expect(
    result.checks.find((c) => c.label === "Cross-document birthdate")?.status,
  ).toBe("manual");
  expect(
    result.checks.find((c) => c.label === "License number consistency")?.status,
  ).toBe("manual");
  expect(
    result.corrections.some((c) => c.documentKind === "drivers_license_back"),
  ).toBe(false);
  expect(result.riskLevel).toBe(2);
  expect(result.riskStatus).toBe("MANUAL_REVIEW_REQUIRED");
  expect(result.preliminaryStatus).not.toBe("passed");
});
it("does not mistake a different passport number for a license-number mismatch", async () => {
  const image = await readableImage();
  let calls = 0;
  const result = await screenDocuments(
    {
      ...input,
      customerType: "international_visitor",
      documents: [document("drivers_license_front"), document("passport")],
      load: async () => image,
      ocr: async () => ({
        available: true,
        fields: {
          name: input.customerName,
          birthdate: "2000-01-15",
          expiry: input.licenseExpiry,
          categories: "A",
          documentNumberHash: ++calls === 1 ? "license" : "passport",
        },
        warnings: [],
      }),
    },
    now,
  );
  expect(
    result.checks.some((c) => c.label === "License number consistency"),
  ).toBe(false);
  expect(result.status).toBe("manual");
});
it("does not pass incomplete OCR, unsupported kinds or conflicting OCR warnings", async () => {
  const image = await readableImage();
  const result = await screenDocuments(
    {
      ...input,
      documents: [...input.documents, document("unsupported")],
      load: async () => image,
      ocr: async () => ({
        available: false,
        fields: {},
        warnings: ["OCR busy"],
      }),
    },
    now,
  );
  expect(result.preliminaryStatus).not.toBe("passed");
  expect(
    result.checks.some((c) => c.detail.includes("Unsupported document")),
  ).toBe(true);
  expect(result.ocr.every((e) => Object.keys(e.fields).length === 0)).toBe(
    true,
  );
});
it("rechecks replacements and excludes stale expired evidence", async () => {
  const image = await readableImage();
  const load = vi.fn(async () => image);
  const result = await screenDocuments(
    {
      ...input,
      documents: [
        {
          ...document("drivers_license_front"),
          id: "old",
          replaced_at: "2026-10-12",
        },
        { ...document("drivers_license_front"), id: "new" },
        document("government_id"),
      ],
      load,
      ocr: async () => ({
        available: true,
        fields: {
          name: input.customerName,
          birthdate: "2000-01-15",
          expiry: input.licenseExpiry,
          categories: "A",
          documentNumberHash: "synthetic",
        },
        warnings: [],
      }),
    },
    now,
  );
  expect(load).toHaveBeenCalledTimes(2);
  expect(result.preliminaryStatus).toBe("passed");
  expect(result.status).toBe("manual");
});

it("routes an unavailable OCR engine to level 2 without requesting useless reuploads", async () => {
  const image = await readableImage();
  const result = await screenDocuments(
    {
      ...input,
      load: async () => image,
      ocr: async () => ({
        available: false,
        fields: {},
        warnings: ["OCR engine busy or unavailable"],
      }),
    },
    now,
  );
  expect(result.riskStatus).toBe("MANUAL_REVIEW_REQUIRED");
  expect(result.corrections).toEqual([]);
});
it("requests correction for missing important OCR information", async () => {
  const image = await readableImage();
  const result = await screenDocuments(
    {
      ...input,
      load: async () => image,
      ocr: async () => ({
        available: true,
        fields: { name: input.customerName },
        warnings: [],
      }),
    },
    now,
  );
  expect(result.riskLevel).toBe(3);
  expect(
    result.corrections.some((c) =>
      c.message.includes("Important document information"),
    ),
  ).toBe(true);
});
it("passes harmless full-name reordering while preserving identity review", async () => {
  const image = await readableImage();
  const result = await screenDocuments(
    {
      ...input,
      load: async () => image,
      ocr: async () => ({
        available: true,
        fields: {
          name: "PERSON, SAMPLE",
          birthdate: "2000-01-15",
          expiry: input.licenseExpiry,
          categories: "A",
          documentNumberHash: "synthetic",
        },
        warnings: [],
      }),
    },
    now,
  );
  expect(result.riskStatus).toBe("DOCUMENT_CHECKS_PASSED");
  expect(result.identityReviewRequired).toBe(true);
  expect(result.status).toBe("manual");
});
it("sends significant name differences to review rather than automatic correction or approval", async () => {
  const image = await readableImage();
  const result = await screenDocuments(
    {
      ...input,
      load: async () => image,
      ocr: async () => ({
        available: true,
        fields: {
          name: "Different Person",
          birthdate: "2000-01-15",
          expiry: input.licenseExpiry,
          categories: "A",
          documentNumberHash: "synthetic",
        },
        warnings: [],
      }),
    },
    now,
  );
  expect(result.riskLevel).toBe(2);
  expect(
    result.reviewReasons.some((reason) =>
      reason.includes("differs significantly"),
    ),
  ).toBe(true);
  expect(result.corrections).toEqual([]);
});
