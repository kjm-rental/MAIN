import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { sendTelegramMessage } from "./bot";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456:test-token-placeholder");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("sends plain protected text to the fixed Telegram API with caching disabled", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  await sendTelegramMessage(123, "Welcome");
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe(
    "https://api.telegram.org/bot123456:test-token-placeholder/sendMessage",
  );
  expect(options).toMatchObject({
    method: "POST",
    cache: "no-store",
    redirect: "error",
  });
  expect(JSON.parse(options.body)).toEqual({
    chat_id: 123,
    text: "Welcome",
    protect_content: true,
  });
});
it("rejects missing or malformed tokens without contacting Telegram", async () => {
  for (const token of ["", "invalid/unsafe-token"]) {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", token);
    await expect(sendTelegramMessage(123, "Welcome")).rejects.toThrow(
      "Telegram is not configured.",
    );
  }
  expect(fetchMock).not.toHaveBeenCalled();
});
it("rejects non-private chat IDs and empty/oversized messages", async () => {
  for (const id of [-1, 0, Number.MAX_SAFE_INTEGER + 1])
    await expect(sendTelegramMessage(id, "Hello")).rejects.toThrow(
      "Invalid Telegram message.",
    );
  for (const text of ["", "x".repeat(4097)])
    await expect(sendTelegramMessage(123, text)).rejects.toThrow(
      "Invalid Telegram message.",
    );
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each(["network", "http", "api", "json"])(
  "suppresses sensitive provider details for %s failures",
  async (mode) => {
    if (mode === "network")
      fetchMock.mockRejectedValue(
        new Error("Sensitive upstream URL and message"),
      );
    else if (mode === "http")
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            description: "Sensitive provider detail",
          }),
          { status: 401 },
        ),
      );
    else if (mode === "api")
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            description: "Sensitive provider detail",
          }),
        ),
      );
    else fetchMock.mockResolvedValue(new Response("invalid json"));
    await expect(sendTelegramMessage(123, "Welcome")).rejects.toThrow(
      /^Telegram message could not be sent\.$/,
    );
  },
);
