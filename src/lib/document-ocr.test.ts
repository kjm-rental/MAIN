import { expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { parseDocumentOcr } from "./document-ocr-fields";
import { recognizeDocument } from "./document-ocr";
const line = (text: string, confidence = 95) => ({ text, confidence });
it("extracts only high-confidence, explicitly labeled fields", () => {
  const result = parseDocumentOcr([
    line("Name: ALICE SAMPLE"),
    line("Date of Birth: 2000-01-15"),
    line("Expiry Date: 15 January 2030"),
    line("DL Codes: A, A1"),
    line("License Number: PRIVATE-NUMBER"),
  ]);
  expect(result.fields).toEqual({
    name: "ALICE SAMPLE",
    birthdate: "2000-01-15",
    expiry: "2030-01-15",
    categories: "A, A1",
  });
  expect(JSON.stringify(result)).not.toContain("PRIVATE-NUMBER");
});
it("does not guess ambiguous dates, low-confidence fields or conflicting names", () => {
  const result = parseDocumentOcr([
    line("Name: ALICE SAMPLE", 60),
    line("Expiry Date: 01/02/2030"),
    line("Date of Birth: 2000-02-30"),
  ]);
  expect(result.fields.name).toBeUndefined();
  expect(result.fields.expiry).toBeUndefined();
  expect(result.fields.birthdate).toBeUndefined();
  expect(result.warnings.length).toBeGreaterThan(0);
  expect(
    parseDocumentOcr([line("Name: ALICE SAMPLE"), line("Name: OTHER PERSON")])
      .fields.name,
  ).toBeUndefined();
});
it("supports explicit surname/given names without treating a license number as category", () => {
  const result = parseDocumentOcr([
    line("Surname: SAMPLE"),
    line("Given Names: ALICE"),
    line("DL Codes: 123456789"),
  ]);
  expect(result.fields.name).toBe("ALICE SAMPLE");
  expect(result.fields.categories).toBeUndefined();
});
it("actually runs the local English OCR engine on a synthetic image without remote services", async () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="500"><rect width="1400" height="500" fill="white"/><g font-family="sans-serif" font-size="54" fill="black"><text x="60" y="90">Name: ALICE SAMPLE</text><text x="60" y="190">Date of Birth: 2000-01-15</text><text x="60" y="290">Expiry Date: 2030-12-31</text><text x="60" y="390">DL Codes: A</text></g></svg>';
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  const result = await recognizeDocument(image);
  expect(result.available).toBe(true);
  expect(result.fields.name).toBe("ALICE SAMPLE");
}, 12000);

it("keeps raw numbers private and compares normalized high-confidence number tokens", () => {
  const first = parseDocumentOcr([line("License Number: A12-345-678")]);
  const second = parseDocumentOcr([line("License No: A12345678")]);
  expect(first.fields.documentNumberHash).toBe(
    second.fields.documentNumberHash,
  );
  expect(first.fields.documentNumberHash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(first)).not.toContain("A12-345-678");
  expect(
    parseDocumentOcr([line("License Number: A12-345-678", 60)]).fields
      .documentNumberHash,
  ).toBeUndefined();
  expect(
    parseDocumentOcr([
      line("License Number: A12-345-678"),
      line("License Number: B99-888-777"),
    ]).fields.documentNumberHash,
  ).toBeUndefined();
});
