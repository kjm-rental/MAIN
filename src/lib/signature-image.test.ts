import { expect, it } from "vitest";
import sharp from "sharp";
import { normalizeSignatureImage } from "./signature-image";
it("decodes and normalizes a signature image while removing metadata", async () => {
  const input = await sharp({
    create: { width: 100, height: 40, channels: 3, background: "white" },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="100" height="40"><path d="M5 30L25 8L40 25L90 15" stroke="black" fill="none" stroke-width="3"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  const output = await normalizeSignatureImage(
    `data:image/png;base64,${input.toString("base64")}`,
  );
  expect((await sharp(Buffer.from(output, "base64")).metadata()).format).toBe(
    "png",
  );
});
it("rejects blank, malformed and oversized signatures", async () => {
  const blank = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await expect(
    normalizeSignatureImage(
      `data:image/png;base64,${blank.toString("base64")}`,
    ),
  ).rejects.toThrow("blank");
  await expect(
    normalizeSignatureImage("data:image/svg+xml;base64,PHN2Zz4="),
  ).rejects.toThrow();
  await expect(
    normalizeSignatureImage("data:image/png;base64," + "A".repeat(1_500_001)),
  ).rejects.toThrow();
});
