import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const checkout = read("../../components/website/booking-checkout.tsx");
const sql = read(
  "../../../supabase/migrations/202610260035_accountless_guest_checkout.sql",
);
it("does not require or create customer auth identities in checkout", () => {
  for (const term of [
    "auth.getUser",
    "signInAnonymously",
    "verifyOtp",
    "email_confirmed_at",
    "verifiedEmail",
    "BookingEmailIdentity",
  ])
    expect(checkout).not.toContain(term);
  expect(checkout).toContain("/api/guest/bookings");
  expect(sql).not.toContain("insert into auth.users");
  expect(sql).not.toContain("set_config");
});
it("binds immutable guest contacts and service-only mutations", () => {
  expect(sql).toContain("guest_booking_contact_immutable");
  expect(sql).toContain("p_access_hash");
  for (const fn of [
    "submit_guest_booking_request(jsonb,text)",
    "finalize_guest_booking_request(uuid,text,text,boolean)",
    "register_guest_verification_document(uuid,text,text,text,text,integer)",
  ]) {
    expect(sql).toContain(
      `revoke all on function public.${fn} from public,anon,authenticated`,
    );
    expect(sql).toContain(
      `grant execute on function public.${fn} to service_role`,
    );
  }
});
it("retains existing price, hold, document and final handover validation", () => {
  for (const term of [
    "public.get_booking_quote_v3",
    "private.calculate_extra_selection",
    "pg_advisory_xact_lock",
    "motorcycle_unavailability",
    "Required private documents are missing",
    "private.kjm_notification_eligible",
  ])
    expect(sql).toContain(term);
  expect(sql).not.toContain(
    "create or replace function private.guard_identity_handover",
  );
  expect(sql).not.toContain("update public.motorcycle_models");
});
it("binds guest notification recipients to booking-specific immutable email", () => {
  expect(sql).toContain(
    "select email into recipient from public.guest_booking_contacts where booking_id=n.booking_id",
  );
  expect(sql).toContain("p.recipient_reference='guest:'||g.booking_id::text");
  expect(sql).toContain("request_hash<>p_hash");
  expect(sql).not.toContain("update public.notification_settings");
});
it("uses private HttpOnly cookie access and never returns document paths to guests", () => {
  const server = read("./server.ts");
  expect(server).toContain("httpOnly: true");
  expect(server).toContain('sameSite: "strict"');
  expect(server).toContain("timingSafeEqual");
  const route = read(
    "../../app/api/guest/bookings/[bookingId]/documents/route.ts",
  );
  expect(route).toContain("ownedGuestBooking");
  expect(route).not.toContain("getPublicUrl");
  expect(route).not.toContain("createSignedUrl");
});
