import { z } from "zod";
import { signatureStrokesSchema } from "@/lib/electronic-signature";
import { normalizeSignatureImage } from "@/lib/signature-image";
import { after } from "next/server";
import {
  ownedGuestBooking,
  guestResponse,
  sameOrigin,
} from "@/lib/guest-checkout/server";
import { notificationServer } from "@/lib/notifications/server";
import { notificationReady } from "@/lib/notifications/readiness";
import { dispatchOne } from "@/lib/notifications/worker";
export const maxDuration = 60;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  if (!sameOrigin(request))
    return guestResponse({ error: "Please use the KJM website." }, 403);
  try {
    const id = z.uuid().parse((await params).bookingId),
      access = await ownedGuestBooking(id);
    if (!access)
      return guestResponse(
        { error: "Keep the browser used for this booking or contact KJM." },
        403,
      );
    const shared = {
      signatureName: z.string().trim().min(2).max(160),
      termsVersion: z.string().min(1).max(100),
      accepted: z.literal(true),
    };
    const input = await request.json();
    const body = z
      .discriminatedUnion("signatureMethod", [
        z.object({
          ...shared,
          signatureMethod: z.literal("drawn"),
          signatureStrokes: signatureStrokesSchema,
        }),
        z.object({
          ...shared,
          signatureMethod: z.literal("uploaded"),
          signatureImage: z.string().min(1).max(1_500_000),
        }),
      ])
      .parse({ ...input, signatureMethod: input.signatureMethod ?? "drawn" });
    let image: string | undefined;
    if (body.signatureMethod === "uploaded") {
      try {
        image = await normalizeSignatureImage(body.signatureImage);
      } catch {
        return guestResponse(
          {
            error:
              "Choose a clear, non-blank PNG or JPG signature image and try again.",
          },
          400,
        );
      }
    }
    const { data, error } = await access.db.rpc(
      body.signatureMethod === "uploaded"
        ? "upload_and_finalize_guest_booking_request"
        : "draw_and_finalize_guest_booking_request",
      {
        p_signature_name: body.signatureName,
        ...(body.signatureMethod === "uploaded"
          ? { p_signature_image: image }
          : { p_signature_strokes: body.signatureStrokes }),
        p_booking_id: id,
        p_access_hash: access.hash,
        p_terms_version: body.termsVersion,
        p_terms_accepted: true,
      },
    );
    if (error || !data?.[0])
      return guestResponse(
        {
          error: error?.message?.includes("color")
            ? "Your selected color is no longer available. Contact KJM or reset your dates to choose another color. Your uploaded documents are preserved."
            : "We couldn’t complete your request. Please check your documents and dates, then try again. Your uploaded documents are preserved.",
        },
        400,
      );
    after(async () => {
      try {
        if (process.env.RESEND_ENABLED !== "true") return;
        const { rpc, config } = notificationServer();
        if (
          !(await notificationReady(
            rpc,
            process.env.NOTIFICATION_REMINDERS_ENABLED === "true",
          ))
        )
          return;
        for (let i = 0; i < 3; i++)
          if ((await dispatchOne(rpc, { ...config, bookingId: id })) === "idle")
            break;
      } catch {
        /* Durable outbox retries are preserved; booking is already saved. */
      }
    });
    return guestResponse(data[0]);
  } catch (error) {
    if (error instanceof z.ZodError)
      return guestResponse(
        {
          error: "Please draw or upload your signature and accept the terms.",
        },
        400,
      );
    return guestResponse(
      {
        error:
          "We couldn’t complete your request. Please try again or contact KJM.",
      },
      503,
    );
  }
}
