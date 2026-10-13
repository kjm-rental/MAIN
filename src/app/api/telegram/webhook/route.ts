import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sendTelegramMessage } from "@/lib/telegram/bot";
import { telegramCommandReply } from "@/lib/telegram/commands";

const maxBodyBytes = 64 * 1024;
const updateSchema = z.object({
  update_id: z.number().int().nonnegative().safe(),
  message: z
    .object({
      chat: z.object({ id: z.number().int().safe(), type: z.string() }),
      from: z.object({ is_bot: z.boolean() }).optional(),
      text: z.string().max(4096).optional(),
    })
    .optional(),
});
const respond = (status: number, error?: string) =>
  Response.json(error ? { error } : { ok: true }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  // Fail closed. Require a strong secret using Telegram's supported characters.
  if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
    return respond(503, "Webhook unavailable.");
  }
  const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (
    !supplied ||
    supplied.length !== secret.length ||
    !/^[A-Za-z0-9_-]+$/.test(supplied) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
  ) {
    return respond(401, "Unauthorized.");
  }
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return respond(415, "JSON required.");
  }
  // Bound the body even when Content-Length is missing or incorrect.
  let payload: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return respond(400, "Invalid update.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBodyBytes) {
        await reader.cancel();
        return respond(413, "Update too large.");
      }
      chunks.push(value);
    }
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return respond(400, "Invalid update.");
  }
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return respond(400, "Invalid update.");
  const message = parsed.data.message;
  // Do not respond in public/group chats, to bots, or to non-message updates.
  if (
    !message ||
    message.chat.type !== "private" ||
    message.chat.id <= 0 ||
    message.from?.is_bot ||
    !message.text
  ) {
    return respond(200);
  }
  // This bot is owner-only. Never learn or trust a recipient from an update.
  const owner = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (
    !owner ||
    !/^[1-9]\d*$/.test(owner) ||
    !Number.isSafeInteger(Number(owner)) ||
    message.chat.id !== Number(owner)
  )
    return respond(200);
  const reply = telegramCommandReply(message.text);
  if (!reply) return respond(200);
  try {
    // Future booking access belongs in a separate authenticated service after
    // explicit one-time linking; never treat a reference/username as ownership.
    await sendTelegramMessage(message.chat.id, reply);
    return respond(200);
  } catch {
    // Return only a generic error; Telegram may retry this update.
    return respond(503, "Reply unavailable.");
  }
}
