vi.mock("@/lib/notifications/readiness", () => ({
  notificationReady: m.ready,
}));
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  dispatch: vi.fn(),
  server: vi.fn(),
  ready: vi.fn(),
}));
vi.mock("@/lib/notifications/server", () => ({ notificationServer: m.server }));
vi.mock("@/lib/notifications/worker", () => ({ dispatchOne: m.dispatch }));
import { POST } from "./route";
const secret = "x".repeat(32);
const call = (authorization = `Bearer ${secret}`) =>
  POST(
    new Request("https://kjmride.com/api/notifications/dispatch", {
      method: "POST",
      headers: { authorization },
    }),
  );
beforeEach(() => {
  vi.resetAllMocks();
  m.ready.mockResolvedValue(true);
  vi.stubEnv("NOTIFICATION_DISPATCH_SECRET", secret);
  vi.stubEnv("RESEND_ENABLED", "true");
  vi.stubEnv("NOTIFICATION_REMINDERS_ENABLED", "false");
  m.server.mockReturnValue({ rpc: m.rpc, config: { apiKey: "test" } });
  m.dispatch.mockResolvedValue("idle");
});
it("requires the scheduler secret", async () => {
  expect((await call("Bearer wrong")).status).toBe(401);
  expect(m.server).not.toHaveBeenCalled();
});
it("handles non-ASCII authorization without throwing", async () => {
  expect((await call("é".repeat(39))).status).toBe(401);
});
it("does nothing while disabled", async () => {
  vi.stubEnv("RESEND_ENABLED", "false");
  expect(await (await call()).json()).toEqual({ status: "disabled" });
  expect(m.server).not.toHaveBeenCalled();
});
it("does not schedule reminders without opt-in", async () => {
  await call();
  expect(m.rpc).not.toHaveBeenCalled();
});
it("calls existing scheduler only after opt-in", async () => {
  vi.stubEnv("NOTIFICATION_REMINDERS_ENABLED", "true");
  await call();
  expect(m.rpc).toHaveBeenCalledWith("notification_schedule_reminders", {});
});
it("bounds dispatch batch size", async () => {
  m.dispatch.mockResolvedValue("sent");
  await call();
  expect(m.dispatch).toHaveBeenCalledTimes(2);
});
it("sanitizes database failures", async () => {
  m.server.mockImplementation(() => {
    throw new Error("private key");
  });
  const r = await call();
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("private key");
});

it("accepts native cron when the dedicated secret is empty", async () => {
  vi.stubEnv("NOTIFICATION_DISPATCH_SECRET", "");
  vi.stubEnv("CRON_SECRET", secret);
  expect((await call()).status).toBe(200);
});

it("cannot deliver before database security and activation are verified", async () => {
  m.ready.mockResolvedValue(false);
  expect((await call()).status).toBe(503);
  expect(m.dispatch).not.toHaveBeenCalled();
});
