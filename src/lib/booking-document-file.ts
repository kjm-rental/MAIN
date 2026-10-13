export const DOCUMENT_ACCEPT =
  "image/avif,image/webp,image/jpeg,image/png,application/pdf";
export function documentFileError(file: Pick<File, "type" | "size">): string {
  if (!DOCUMENT_ACCEPT.split(",").includes(file.type))
    return "Choose an AVIF, WebP, JPEG, PNG image or PDF.";
  if (file.size > 8_388_608)
    return "This file is too large. Choose a file under 8 MB.";
  if (file.size === 0) return "This file is empty. Choose another file.";
  return "";
}
