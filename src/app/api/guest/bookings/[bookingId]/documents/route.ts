import { randomUUID } from "node:crypto";
import { z } from "zod";
import { documentFileError } from "@/lib/booking-document-file";
import { documentKinds } from "@/lib/guest-checkout/validation";
import {
  signUploadTicket,
  verifyUploadTicket,
  uploadDetails,
} from "@/lib/guest-checkout/upload-ticket";
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
    // Only metadata passes through the function. File bytes go directly to the
    // private bucket, avoiding the hosting platform's 4.5 MB request limit.
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = await request.json();
      if (body.action === "prepare") {
        const details = uploadDetails.parse(body);
        const { data: booking, error: bookingError } = await access.db
          .from("bookings")
          .select("status,expires_at")
          .eq("id", id)
          .single();
        if (
          bookingError ||
          !booking ||
          !["pending", "confirmed"].includes(booking.status) ||
          (booking.status === "pending" &&
            booking.expires_at &&
            Date.parse(booking.expires_at) <= Date.now())
        )
          return guestResponse(
            {
              error:
                "This booking has expired or cannot accept documents. Choose your rental dates again or contact KJM.",
            },
            409,
          );
        const path = `guest/${id}/${randomUUID()}`;
        const { data, error } = await access.db.storage
          .from("identity-verification")
          .createSignedUploadUrl(path, { upsert: false });
        if (error || !data)
          return guestResponse(
            {
              error:
                "Secure upload is temporarily unavailable. Please try again.",
            },
            503,
          );
        return guestResponse({
          path,
          token: data.token,
          ticket: signUploadTicket({
            ...details,
            bookingId: id,
            hash: access.hash,
            path,
            expires: Date.now() + 30 * 60_000,
          }),
        });
      }
      const ticket = verifyUploadTicket(
        z.string().max(4096).parse(body.ticket),
        id,
        access.hash,
      );
      if (!ticket)
        return guestResponse(
          {
            error:
              "Your upload session expired. Please select the document again.",
          },
          400,
        );
      // A lost response may be retried without replacing evidence or sending duplicate notices.
      const { data: existing } = await access.db
        .from("verification_documents")
        .select("id")
        .eq("booking_id", id)
        .eq("storage_path", ticket.path)
        .maybeSingle();
      if (existing) return guestResponse({ saved: true });
      const { data, error } = await access.db.rpc(
        "register_guest_verification_document",
        {
          p_booking_id: id,
          p_access_hash: access.hash,
          p_kind: ticket.kind,
          p_storage_path: ticket.path,
          p_mime_type: ticket.mimeType,
          p_size_bytes: ticket.size,
        },
      );
      if (error) {
        console.error("guest_document_registration_failed", {
          code: error.code,
        });
        return guestResponse(
          {
            error:
              "This document could not be registered. Your booking may have expired or require staff review. Please retry or contact KJM.",
          },
          409,
        );
      }
      return guestResponse({ saved: !!data });
    }
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
  } catch (error) {
    if (error instanceof z.ZodError)
      return guestResponse(
        { error: "Choose a supported image or PDF no larger than 8 MB." },
        400,
      );
    return guestResponse(
      { error: "Your document could not be saved. Please try again." },
      503,
    );
  }
}
