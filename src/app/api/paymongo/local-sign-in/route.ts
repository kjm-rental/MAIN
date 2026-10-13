import { readFile } from "node:fs/promises";
import { createClient } from "@/lib/supabase/server";
import { respond } from "@/lib/paymongo/test-payments";
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production")
    return respond({ error: "Unavailable" }, 404);
  if (
    process.env.KJM_PAYMONGO_TEST !== "true" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !==
      "https://uuxjymzrtncrnnkvdpjy.supabase.co" ||
    !["http://localhost:3000", "http://127.0.0.1:3000"].includes(
      request.headers.get("origin") ?? "",
    )
  )
    return respond({ error: "Unavailable" }, 403);
  try {
    const credentials = JSON.parse(
      await readFile(
        `${process.cwd()}/.paymongo-tools/local-login.json`,
        "utf8",
      ),
    );
    if (!credentials.email?.endsWith("@example.invalid"))
      return respond({ error: "Unavailable" }, 403);
    const client = await createClient();
    const auth = await client.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });
    if (
      auth.error ||
      auth.data.user?.id !== credentials.id ||
      auth.data.user.is_anonymous
    )
      return respond({ error: "Test sign-in unavailable" }, 403);
    const allowed = await client.rpc("can_use_booking_testing");
    if (allowed.error || !allowed.data) {
      await client.auth.signOut();
      return respond({ error: "Test authorization required" }, 403);
    }
    return respond({ ok: true });
  } catch {
    return respond({ error: "Test sign-in unavailable" }, 503);
  }
}
