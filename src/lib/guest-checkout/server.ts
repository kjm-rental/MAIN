import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
export const guestCookie = "kjm_guest_checkout";
export function guestDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Guest checkout unavailable");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  });
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
export function guestResponse(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function guestHash(create = false) {
  const jar = await cookies();
  let token = jar.get(guestCookie)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (!create) return null;
    token = randomBytes(32).toString("hex");
    jar.set(guestCookie, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  }
  return createHash("sha256").update(token).digest("hex");
}
export async function ownedGuestBooking(id: string) {
  const hash = await guestHash();
  if (!hash) return null;
  const db = guestDb();
  const { data, error } = await db
    .from("guest_booking_contacts")
    .select("booking_id,access_hash")
    .eq("booking_id", id)
    .maybeSingle();
  if (
    error ||
    !data ||
    typeof data.access_hash !== "string" ||
    data.access_hash.length !== hash.length ||
    !timingSafeEqual(Buffer.from(hash), Buffer.from(data.access_hash))
  )
    return null;
  return { db, hash };
}
export async function verifyHuman(token: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!token) return false;
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(7000),
      },
    );
    const data = await response.json();
    return (
      data.success === true &&
      (!process.env.KJM_TURNSTILE_HOSTNAME ||
        data.hostname === process.env.KJM_TURNSTILE_HOSTNAME)
    );
  } catch {
    return false;
  }
}
