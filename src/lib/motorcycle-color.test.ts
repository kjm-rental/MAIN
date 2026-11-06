import { expect, it } from "vitest";
import { normalizeMotorcycleColor } from "./motorcycle-color";
import { readFileSync } from "node:fs";

it("normalizes case, slash spacing and repeated whitespace without merging combinations", () => {
  expect(normalizeMotorcycleColor(" black/WHITE ")).toBe("Black / White");
  expect(normalizeMotorcycleColor(" MATTE   black / blue ")).toBe(
    "Matte Black / Blue",
  );
  expect(normalizeMotorcycleColor("Black / White")).not.toBe(
    normalizeMotorcycleColor("White / Black"),
  );
  expect(normalizeMotorcycleColor("")).toBe("");
});

// SQL contracts complement mocked actions; they do not substitute for a live
// database concurrency test. No fixtures or inventory records are inserted.
const sql = readFileSync(
  "docs/motorcycle-unit-colors/booking-integration.prepared.sql",
  "utf8",
);
it("preserves unit-level booking, live-hold and maintenance exclusions", () => {
  expect(sql).toContain("private.color_eligible_units");
  expect(sql).toContain("b.status in ('pending','confirmed','active')");
  expect(sql).toContain("h.expires_at>now()");
  expect(sql).toContain("h.released_at is null and h.converted_at is null");
  expect(sql).toContain("public.motorcycle_unavailability");
  expect(sql).toContain("for update of u skip locked limit 1");
  expect(sql).toContain(
    "pg_advisory_xact_lock(hashtextextended(model::text,0))",
  );
});
it("filters assignment by color and persists an explicit snapshot", () => {
  expect(sql).toContain(
    "private.normalize_motorcycle_color(u.color)=selected_color",
  );
  expect(sql).toContain(
    "insert into public.bookings(selected_color,booking_reference",
  );
  expect(sql).toContain("bookings_guard_unit_color before insert or update");
  expect(sql).toContain(
    "booking_holds_guard_unit_color before insert or update",
  );
  expect(sql).toContain("Assigned unit must match the selected color");
  expect(sql).toContain(
    "'selectedColor',(select selected_color from public.bookings",
  );
});
it("public color availability aggregates real units and exposes no plates or unit identifiers", () => {
  const rpc = sql.slice(
    sql.indexOf("create function public.get_motorcycle_color_availability"),
    sql.indexOf("-- Defense in depth"),
  );
  expect(rpc).toContain("returns table(color text,available_count integer)");
  expect(rpc).toContain("count(e.id)");
  expect(rpc).toContain("left join private.color_eligible_units");
  expect(rpc).not.toContain("registration_plate");
  expect(rpc).not.toContain("internal_unit_code");
});
it("preserves legacy bookings and never creates inventory or modifies old bookings on migration", () => {
  expect(sql).not.toMatch(/insert into public\.motorcycle_(?:units|models)/i);
  expect(sql).not.toMatch(/delete from public\.motorcycle_units/i);
  expect(sql).not.toMatch(/alter table public\.bookings.*not null/i);
  expect(sql).toContain(
    "create trigger bookings_require_color_on_insert before insert",
  );
});
