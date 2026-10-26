import { notificationReady } from "@/lib/notifications/readiness";
import { timingSafeEqual } from "node:crypto";
import { notificationServer } from "@/lib/notifications/server";
import { dispatchOne } from "@/lib/notifications/worker";

export const maxDuration = 60;
export async function POST(request: Request) {
  const secret =
    process.env.NOTIFICATION_DISPATCH_SECRET || process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.RESEND_ENABLED !== "true")
    return Response.json({ status: "disabled" });
  try {
    const { rpc, config } = notificationServer();
    if (
      !(await notificationReady(
        rpc,
        process.env.NOTIFICATION_REMINDERS_ENABLED === "true",
      ))
    )
      return Response.json(
        {
          error:
            "Notification database activation prerequisites are incomplete",
        },
        { status: 503 },
      );
    // Scheduling remains separately opt-in and also gated by existing DB preferences.
    if (process.env.NOTIFICATION_REMINDERS_ENABLED === "true")
      await rpc("notification_schedule_reminders", {});
    // Two serial leases keep provider traffic and execution time bounded.
    const results: string[] = [];
    for (let i = 0; i < 2; i++) {
      const status = await dispatchOne(rpc, config);
      results.push(status);
      if (status === "idle") break;
    }
    return Response.json({ results });
  } catch {
    // Never echo provider responses, customer data, database errors or credentials.
    return Response.json(
      { error: "Notification processing unavailable" },
      { status: 503 },
    );
  }
}

// Native Vercel Cron uses GET with the same bearer authentication. No job is installed.
export const GET = POST;
