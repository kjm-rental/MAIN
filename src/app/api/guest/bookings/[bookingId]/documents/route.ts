import { randomUUID } from "node:crypto";
import { z } from "zod";
import { documentFileError } from "@/lib/booking-document-file";
import { documentKinds } from "@/lib/guest-checkout/validation";
import {
  ownedGuestBooking,
  guestResponse,
  sameOrigin,
} from "@/lib/guest-checkout/server";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  if (!sameOrigin(request))
    return guestResponse({ error: "Please use the KJM booking page." }, 403);
  try {
    const id = z.uuid().parse((await params).bookingId),
      access = await ownedGuestBooking(id);
    if (!access)
      return guestResponse(
        { error: "Keep the browser used for this booking, or contact KJM." },
        403,
      );
    if (Number(request.headers.get("content-length")) > 8500000)
      return guestResponse(
        { error: "Please use a document smaller than 8 MB." },
        400,
      );
    const form = await request.formData(),
      file = form.get("file"),
      kind = z.enum(documentKinds).parse(form.get("kind"));
    if (!(file instanceof File) || documentFileError(file))
      return guestResponse(
        { error: "Please upload a supported document smaller than 8 MB." },
        400,
      );
    const path = `guest/${id}/${randomUUID()}`;
    const { error: uploadError } = await access.db.storage
      .from("identity-verification")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError)
      return guestResponse(
        { error: "Your document could not be uploaded. Please try again." },
        503,
      );
    const { data, error } = await access.db.rpc(
      "register_guest_verification_document",
      {
        p_booking_id: id,
        p_access_hash: access.hash,
        p_kind: kind,
        p_storage_path: path,
        p_mime_type: file.type,
        p_size_bytes: file.size,
      },
    );
    if (error) {
      await access.db.storage.from("identity-verification").remove([path]);
      return guestResponse(
        {
          error:
            "This document cannot be changed right now. Refresh your booking or contact KJM.",
        },
        400,
      );
    }
    return guestResponse({ saved: !!data });
  } catch {
    return guestResponse(
      { error: "Your document could not be saved. Please try again." },
      503,
    );
  }
}
