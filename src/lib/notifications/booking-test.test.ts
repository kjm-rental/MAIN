import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bookingTestEnabled,
  eligibleTestBooking,
  sendBookingTest,
} from "./booking-test";
let directory: string;
const id = "11111111-1111-4111-8111-111111111111";
const payload = {
  bookingId: id,
  reference: "KJM-TEST",
  motorcycle: "Existing motorcycle",
  pickupAt: "2030-01-01T09:00:00Z",
  returnAt: "2030-01-02T09:00:00Z",
  rentalCentavos: 70000,
};
const request = () =>
  new Request("http://localhost:3000/api/notifications/booking/" + id, {
    method: "POST",
    headers: { host: "localhost:3000", origin: "http://localhost:3000" },
  });
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "kjm-mail-"));
  vi.spyOn(process, "cwd").mockReturnValue(directory);
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("RESEND_ENABLED", "false");
  vi.stubEnv("NOTIFICATION_REMINDERS_ENABLED", "false");
  vi.stubEnv("RESEND_BOOKING_TEST_ENABLED", "true");
  vi.stubEnv(
    "RESEND_BOOKING_TEST_AFTER",
    new Date(Date.now() - 1000).toISOString(),
  );
  vi.stubEnv("RESEND_TEST_RECIPIENT", "owner@example.com");
  vi.stubEnv("RESEND_API_KEY", "fake-test-key");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
it("requires an armed localhost development request with general delivery off", () => {
  expect(bookingTestEnabled(request())).toBe(true);
  for (const key of ["RESEND_ENABLED", "NOTIFICATION_REMINDERS_ENABLED"]) {
    vi.stubEnv(key, "true");
    expect(bookingTestEnabled(request())).toBe(false);
    vi.stubEnv(key, "false");
  }
  vi.stubEnv("NODE_ENV", "production");
  expect(bookingTestEnabled(request())).toBe(false);
});
it("rejects cross-origin, missing host, stale and future arming windows", () => {
  expect(
    bookingTestEnabled(
      new Request(request().url, {
        headers: { host: "localhost:3000", origin: "https://other.test" },
      }),
    ),
  ).toBe(false);
  expect(bookingTestEnabled(new Request(request().url))).toBe(false);
  for (const ms of [-3_600_001, 60_000]) {
    vi.stubEnv(
      "RESEND_BOOKING_TEST_AFTER",
      new Date(Date.now() + ms).toISOString(),
    );
    expect(bookingTestEnabled(request())).toBe(false);
  }
});
it("accepts only newly confirmed real bookings with the allowlisted address", () => {
  const b = {
    email: "OWNER@example.com",
    createdAt: new Date().toISOString(),
    status: "confirmed",
    isTest: false,
  };
  expect(eligibleTestBooking(b)).toBe(true);
  for (const patch of [
    { email: "attacker@example.com" },
    { status: "submitted" },
    { isTest: true },
    { createdAt: "2000-01-01" },
  ])
    expect(eligibleTestBooking({ ...b, ...patch })).toBe(false);
});
it("sends exactly once across concurrent requests and different bookings", async () => {
  const transport = vi
    .fn()
    .mockResolvedValue(Response.json({ id: "provider-test" }));
  await Promise.all([
    sendBookingTest(payload, transport),
    sendBookingTest(payload, transport),
  ]);
  expect(await sendBookingTest(payload, transport)).toBe("sent");
  expect(
    await sendBookingTest(
      { ...payload, bookingId: "22222222-2222-4222-8222-222222222222" },
      transport,
    ),
  ).toBe("held");
  expect(transport).toHaveBeenCalledTimes(1);
  expect(JSON.parse(transport.mock.calls[0][1].body).to).toEqual([
    "owner@example.com",
  ]);
});
it("never retries uncertain or rejected delivery", async () => {
  const transport = vi.fn().mockRejectedValue(new Error("timeout"));
  expect(await sendBookingTest(payload, transport)).toBe("held");
  expect(await sendBookingTest(payload, transport)).toBe("held");
  expect(transport).toHaveBeenCalledTimes(1);
});
it("a corrupt attempt guard cannot reopen delivery", async () => {
  const transport = vi
    .fn()
    .mockResolvedValue(Response.json({ id: "provider-test" }));
  await sendBookingTest(payload, transport);
  await writeFile(
    join(directory, ".resend-booking-test/attempt.json"),
    "broken",
  );
  await expect(sendBookingTest(payload, transport)).rejects.toThrow(
    "requires review",
  );
  expect(transport).toHaveBeenCalledTimes(1);
});

it("accepts Next's internal loopback URL only with the exact localhost host and origin", () => {
  expect(
    bookingTestEnabled(
      new Request("http://127.0.0.1:3000/api/test", {
        headers: { host: "localhost:3000", origin: "http://localhost:3000" },
      }),
    ),
  ).toBe(true);
  expect(
    bookingTestEnabled(
      new Request("http://127.0.0.1:3000/api/test", {
        headers: { host: "public.example", origin: "http://localhost:3000" },
      }),
    ),
  ).toBe(false);
});
