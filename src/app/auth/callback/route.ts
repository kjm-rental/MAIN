import { bookingRequestOrigin } from "@/lib/notifications/booking-test";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "";
  // No external redirect destinations or session tokens in error responses.
  if (
    !code ||
    !/^(?:\/booking\/status\/[0-9a-f-]{36}|\/book(?:\/[a-z0-9-]+)?\/?)$/i.test(
      next,
    )
  )
    return new Response("Invalid verification link", { status: 400 });
  const client = await createClient();
  const before = await client.auth.getUser();
  // PKCE exchange is bound to the original browser verifier.
  const result = await client.auth.exchangeCodeForSession(code);
  if (
    result.error ||
    !before.data.user ||
    result.data.user?.id !== before.data.user.id
  )
    return new Response(
      "Use your original booking browser to verify your email.",
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  return Response.redirect(new URL(next, bookingRequestOrigin(request)), 303);
}
