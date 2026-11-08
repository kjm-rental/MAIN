import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { documentKinds } from "./validation";
export const uploadDetails = z.object({
  kind: z.enum(documentKinds),
  mimeType: z.enum([
    "image/avif",
    "image/webp",
    "image/jpeg",
    "image/png",
    "application/pdf",
  ]),
  size: z.number().int().min(1).max(8_388_608),
});
const ticketSchema = uploadDetails.extend({
  bookingId: z.uuid(),
  hash: z.string(),
  path: z.string(),
  expires: z.number(),
});
type Ticket = z.infer<typeof ticketSchema>;
function mac(payload: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw Error("Upload unavailable");
  return createHmac("sha256", key)
    .update(`guest-document:${payload}`)
    .digest("hex");
}
export function signUploadTicket(ticket: Ticket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${mac(payload)}`;
}
export function verifyUploadTicket(
  value: string,
  bookingId: string,
  hash: string,
): Ticket | null {
  try {
    const [payload, signature, extra] = value.split(".");
    if (extra || !payload || !/^[a-f0-9]{64}$/.test(signature ?? ""))
      return null;
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(mac(payload))))
      return null;
    const ticket = ticketSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString()),
    );
    if (
      ticket.bookingId !== bookingId ||
      ticket.hash !== hash ||
      ticket.expires < Date.now() ||
      !ticket.path.startsWith(`guest/${bookingId}/`)
    )
      return null;
    return ticket;
  } catch {
    return null;
  }
}
