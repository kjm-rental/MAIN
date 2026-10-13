import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/telegram/bot", () => ({ sendTelegramMessage: mocks.send }));
import { POST } from "./route";
const secret = "test_webhook_secret_0123456789abcdef";
const update = (text: string, type = "private") => ({
  update_id: 1,
  message: { chat: { id: 123, type }, from: { is_bot: false }, text },
});
const request = (
  payload: unknown,
  header: string | null = secret,
  contentType = "application/json",
) =>
  new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      ...(header ? { "X-Telegram-Bot-Api-Secret-Token": header } : {}),
    },
    body: JSON.stringify(payload),
  });
beforeEach(() => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", secret);
  vi.stubEnv("TELEGRAM_OWNER_CHAT_ID", "123");
  mocks.send.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
it("fails closed for missing/weak server configuration", async () => {
  for (const value of ["", "weak", "x".repeat(257)]) {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", value);
    expect((await POST(request(update("/start")))).status).toBe(503);
  }
  expect(mocks.send).not.toHaveBeenCalled();
});
it.each([null, "wrong", "x".repeat(secret.length), "é".repeat(secret.length)])(
  "rejects an invalid secret header before reading the body: %s",
  async (header) => {
    const req = request(update("/start"), header);
    expect((await POST(req)).status).toBe(401);
    expect(req.bodyUsed).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  },
);
it("welcomes customers without reflecting /start arguments", async () => {
  const response = await POST(
    request(update("/start@KJMRentalBot sensitive-link-argument")),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(mocks.send).toHaveBeenCalledWith(
    123,
    expect.stringContaining("Welcome to KJM Motorcycle Rental!"),
  );
  expect(mocks.send.mock.calls[0][1]).not.toContain("sensitive-link-argument");
});
it("provides linking guidance only, without exposing or retrieving bookings", async () => {
  expect((await POST(request(update("/mybookings")))).status).toBe(200);
  expect(mocks.send).toHaveBeenCalledWith(
    123,
    expect.stringContaining("not available yet"),
  );
  expect(mocks.send.mock.calls[0][1]).toContain("No customer account linking");
});
it.each([
  update("/start", "group"),
  update("/mybookings", "supergroup"),
  update("/start@OtherBot"),
  update("/starter"),
  update("/unknown"),
  { update_id: 2 },
  {
    ...update("/start"),
    message: { ...update("/start").message, from: { is_bot: true } },
  },
])(
  "acknowledges unsupported updates without sending anything",
  async (payload) => {
    expect((await POST(request(payload))).status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
  },
);
it("rejects invalid JSON, invalid shapes and wrong content types", async () => {
  const bad = new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": secret,
    },
    body: "{",
  });
  expect((await POST(bad)).status).toBe(400);
  expect((await POST(request({ update_id: "invalid" }))).status).toBe(400);
  expect(
    (await POST(request(update("/start"), secret, "text/plain"))).status,
  ).toBe(415);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("bounds payload size without relying on Content-Length", async () => {
  expect(
    (await POST(request({ update_id: 1, padding: "x".repeat(65536) }))).status,
  ).toBe(413);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("allows Telegram to retry failures without exposing provider errors", async () => {
  mocks.send.mockRejectedValue(new Error("Sensitive upstream data"));
  const response = await POST(request(update("/start")));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Reply unavailable." });
});

it("does not respond to customers or infer an owner when no owner is configured", async () => {
  const other = update("/mybookings");
  other.message.chat.id = 456;
  expect((await POST(request(other))).status).toBe(200);
  vi.stubEnv("TELEGRAM_OWNER_CHAT_ID", "");
  expect((await POST(request(update("/start")))).status).toBe(200);
  expect(mocks.send).not.toHaveBeenCalled();
});
