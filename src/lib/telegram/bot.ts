import "server-only";

/** Server-only transport. Never log the request URL: it contains the bot token. */
export async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("Telegram is not configured.");
  }
  if (
    !Number.isSafeInteger(chatId) ||
    chatId <= 0 ||
    !text ||
    text.length > 4096
  ) {
    throw new Error("Invalid Telegram message.");
  }
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, protect_content: true }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      },
    );
    const result: unknown = await response.json();
    if (
      !response.ok ||
      !result ||
      typeof result !== "object" ||
      !("ok" in result) ||
      result.ok !== true
    ) {
      throw new Error("Telegram request failed.");
    }
  } catch {
    // Provider errors and fetch errors can include URLs, chat IDs or message text.
    throw new Error("Telegram message could not be sent.");
  }
}
