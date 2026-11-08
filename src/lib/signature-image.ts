import sharp from "sharp";
export async function normalizeSignatureImage(value: string) {
  if (
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ||
    value.length > 1_500_000
  )
    throw Error("Choose a clear PNG or JPG signature image.");
  const bytes = Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
  const image = sharp(bytes, { limitInputPixels: 1_000_000, animated: false });
  const metadata = await image.metadata();
  if (
    metadata.format !== "png" ||
    !metadata.width ||
    !metadata.height ||
    (metadata.pages && metadata.pages !== 1)
  )
    throw Error("Choose a clear PNG or JPG signature image.");
  const normalized = await image
    .flatten({ background: "white" })
    .resize({
      width: 1000,
      height: 400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const stats = await sharp(normalized).stats();
  if (stats.channels.every((channel) => channel.stdev < 1))
    throw Error(
      "The signature image looks blank. Please choose an image showing your signature.",
    );
  if (normalized.length > 1_000_000)
    throw Error("Please choose a smaller signature image.");
  return normalized.toString("base64");
}
