import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const delivery = readFileSync(
    "supabase/migrations/202610260037_delivery_collection.sql",
    "utf8",
  ),
  guest = readFileSync(
    "supabase/migrations/202610260038_guest_qrph_checkout.sql",
    "utf8",
  );
it("does not seed service areas, enable live payments or alter historical records", () => {
  expect(delivery).not.toMatch(
    /insert into public.delivery_areas\(.*?\) values\('/,
  );
  expect(delivery).toContain("enabled boolean not null default false");
  expect(guest).not.toContain("set enabled=true");
  expect(delivery).not.toContain("update public.payment_events");
});
it("preserves totals, locks owner pricing and snapshots original agreements", () => {
  expect(delivery).toContain(
    "base_total_php+extras_total_php+services_total_php",
  );
  expect(delivery).toContain("where id for share");
  expect(delivery).toContain("and enabled for share");
  expect(delivery).toContain("booking_services_immutable");
  expect(delivery).toContain("p_expected_delivery_centavos");
  expect(delivery).toContain("p_expected_collection_centavos");
});
it("validates separate Manila delivery/collection hours without changing rental hours", () => {
  expect(delivery).toContain("at time zone 'Asia/Manila'");
  expect(delivery).toContain("s.delivery_open");
  expect(delivery).toContain("s.collection_open");
  expect(delivery).not.toContain("update public.booking_settings");
});
it("binds guest QRPh to cookie hash, booking selection, readiness and original total excluding deposit", () => {
  expect(guest).toContain("access_hash=p_access_hash");
  expect(guest).toContain("payment_method='qrph'");
  expect(guest).toContain("round(b.quoted_total_php*100)");
  expect(guest).not.toContain("quoted_total_php+b.deposit_required_centavos");
});
it("keeps service reads admin-only and mutation RPCs server-only", () => {
  expect(delivery).toContain("enable row level security");
  expect(delivery).toContain("private.is_active_admin()");
  expect(guest).toContain("from public,anon,authenticated");
  expect(guest).toContain("to service_role");
});
