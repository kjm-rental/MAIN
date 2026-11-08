import { createClient } from "@/lib/supabase/client";
import { documentFileError } from "@/lib/booking-document-file";
export async function uploadGuestDocument(
  bookingId: string,
  kind: string,
  file: File,
) {
  const issue = documentFileError(file);
  if (issue) throw Error(issue);
  const endpoint = `/api/guest/bookings/${bookingId}/documents`;
  async function send(body: unknown) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Error(
        data.error || "Your document could not be saved. Please try again.",
      );
    return data;
  }
  const prepared = await send({
    action: "prepare",
    kind,
    mimeType: file.type,
    size: file.size,
  });
  const { error } = await createClient()
    .storage.from("identity-verification")
    .uploadToSignedUrl(prepared.path, prepared.token, file, {
      contentType: file.type,
      upsert: false,
    });
  if (error)
    throw Error(
      "Your document could not be uploaded. Check your connection and try again.",
    );
  await send({ action: "complete", ticket: prepared.ticket });
}
