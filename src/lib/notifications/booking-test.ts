import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { BRAND, render, type Payload } from "./templates";

const directory = () => join(process.cwd(), ".resend-booking-test");
// Next may construct internal URLs with 127.0.0.1 while the browser uses localhost.
export function bookingRequestOrigin(request: Request, env = process.env) {
  const url = new URL(request.url);
  if (
    env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.port === "3000" &&
    request.headers.get("host") === "localhost:3000"
  )
    return "http://localhost:3000";
  return url.origin;
}
export function bookingTestEnabled(request: Request, env = process.env) {
  const url = new URL(request.url);
  const armed = Date.parse(env.RESEND_BOOKING_TEST_AFTER ?? "");
  return (
    env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.port === "3000" &&
    request.headers.get("host") === "localhost:3000" &&
    request.headers.get("origin") === "http://localhost:3000" &&
    env.RESEND_ENABLED === "false" &&
    env.NOTIFICATION_REMINDERS_ENABLED === "false" &&
    env.RESEND_BOOKING_TEST_ENABLED === "true" &&
    z.email().safeParse(env.RESEND_TEST_RECIPIENT).success &&
    Number.isFinite(armed) &&
    armed <= Date.now() &&
    Date.now() - armed < 3_600_000
  );
}
export function eligibleTestBooking(
  input: {
    email: string | null;
    createdAt: string;
    status: string;
    isTest: boolean;
  },
  env = process.env,
) {
  return (
    input.status === "confirmed" &&
    !input.isTest &&
    input.email?.trim().toLowerCase() ===
      env.RESEND_TEST_RECIPIENT?.trim().toLowerCase() &&
    Date.parse(input.createdAt) >=
      Date.parse(env.RESEND_BOOKING_TEST_AFTER ?? "")
  );
}
const attemptSchema = z.object({
  bookingId: z.uuid(),
  state: z.enum(["attempting", "sent", "held"]),
  provider: z.string().optional(),
});
export async function bookingTestAttempt() {
  try {
    return attemptSchema.parse(
      JSON.parse(await readFile(join(directory(), "attempt.json"), "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    // A damaged ledger must never silently reopen the send gate.
    throw new Error("Controlled email attempt requires review");
  }
}
/** One durable slot across ALL bookings. Never automatically reset/retry an ambiguous send. */
export async function sendBookingTest(
  payload: Payload,
  transport: typeof fetch = fetch,
) {
  const rendered = render("booking_approved", payload, {});
  const recipient = z.email().parse(process.env.RESEND_TEST_RECIPIENT);
  if (!process.env.RESEND_API_KEY)
    throw new Error("Email configuration required");
  const body = JSON.stringify({
    from: BRAND.from,
    to: [recipient],
    reply_to: BRAND.reply,
    ...rendered,
  });
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  const path = join(directory(), "attempt.json");
  let file;
  try {
    file = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const existing = await bookingTestAttempt();
      return existing?.bookingId === payload.bookingId &&
        existing.state === "sent"
        ? "sent"
        : "held";
    }
    throw error;
  }
  // Persist before making any provider call; crashes, timeouts and rejected requests hold the slot.
  try {
    await file.writeFile(
      JSON.stringify({ bookingId: payload.bookingId, state: "attempting" }),
    );
    await file.sync();
  } finally {
    await file.close();
  }
  let result: { bookingId: string; state: "sent" | "held"; provider?: string } =
    { bookingId: payload.bookingId, state: "held" };
  try {
    const response = await transport("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `kjm/local-booking/${createHash("sha256").update(payload.bookingId).digest("hex")}/v1`,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const parsed = z
        .object({ id: z.string().min(1).max(128) })
        .safeParse(await response.json());
      if (parsed.success)
        result = { ...result, state: "sent", provider: parsed.data.id };
    }
  } catch {
    /* Hold uncertain delivery for manual review, never retry automatically. */
  }
  await writeFile(path, JSON.stringify(result), { mode: 0o600 });
  return result.state;
}
