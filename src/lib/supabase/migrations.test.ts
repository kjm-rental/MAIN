import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const migrationsDirectory = fileURLToPath(
  new URL("../../../supabase/migrations/", import.meta.url),
);

const schemaSql = readFileSync(
  `${migrationsDirectory}202610090001_phase3_core_schema.sql`,
  "utf8",
);
const rlsSql = readFileSync(
  `${migrationsDirectory}202610090002_phase3_rls.sql`,
  "utf8",
);
const seedSql = readFileSync(
  `${migrationsDirectory}202610090003_phase3_seed_motorcycle_models.sql`,
  "utf8",
);
const catalogContentSql = readFileSync(
  `${migrationsDirectory}202610090004_catalog_content_and_media.sql`,
  "utf8",
);
const mediaPolicySql = readFileSync(
  `${migrationsDirectory}202610090005_restrict_public_catalog_media.sql`,
  "utf8",
);
const nmaxCorrectionSql = readFileSync(
  `${migrationsDirectory}202610090006_nmax_v3_catalog_label.sql`,
  "utf8",
);
const bookingSql = readFileSync(
  `${migrationsDirectory}202610090008_phase5_booking_and_verification.sql`,
  "utf8",
);
const bookingHotfixSql = readFileSync(
  `${migrationsDirectory}202610090009_fix_booking_submission_ambiguity.sql`,
  "utf8",
);
const bookingSettingsSql = readFileSync(
  `${migrationsDirectory}202610090010_booking_settings_administration.sql`,
  "utf8",
);
const bookingFinalizationSql = readFileSync(
  `${migrationsDirectory}202610090011_booking_engine_finalization.sql`,
  "utf8",
);
const midnightHoursSql = readFileSync(
  `${migrationsDirectory}202610090012_support_midnight_operating_hours.sql`,
  "utf8",
);
const developerTestingSql = readFileSync(
  `${migrationsDirectory}202610090013_restricted_developer_booking_testing.sql`,
  "utf8",
);
const removeDeveloperTestingSql = readFileSync(
  `${migrationsDirectory}202610090014_remove_developer_testing.sql`,
  "utf8",
);
const documentIntegritySql = readFileSync(
  `${migrationsDirectory}202610090015_harden_booking_document_integrity.sql`,
  "utf8",
);
const restrictedTestAccountsSql = readFileSync(
  `${migrationsDirectory}202610090016_restricted_booking_test_accounts.sql`,
  "utf8",
);
const bookingExtrasSql = readFileSync(
  `${migrationsDirectory}202610090017_booking_extras.sql`,
  "utf8",
);
const phase6Sql = readFileSync(
  `${migrationsDirectory}202610090018_phase6_extras_inventory_and_payments.sql`,
  "utf8",
);

const expectedSeedValues = [
  ["honda-beat", "Honda Beat", 499],
  ["yamaha-mio-gravis-125cc", "Yamaha Mio Gravis 125cc", 550],
  ["honda-click-125cc", "Honda Click 125cc", 599],
  ["honda-click-160cc", "Honda Click 160cc", 700],
  ["yamaha-aerox-160cc", "Yamaha Aerox 160cc", 750],
  ["honda-pcx-160cc", "Honda PCX 160cc", 800],
  ["yamaha-nmax-155cc", "Yamaha NMAX 155cc", 850],
  ["honda-adv-160", "Honda ADV 160", 900],
  ["suzuki-v-strom-160", "Suzuki V-Strom 160", 950],
  ["honda-adv-350", "Honda ADV 350", 1800],
] as const;

describe("Phase 3 migrations", () => {
  it("seeds exactly the ten approved slugs, display names, and prices", () => {
    expect(seedSql.match(/^\s+\('[a-z0-9-]+'/gm)).toHaveLength(10);
    for (const [slug, displayName, price] of expectedSeedValues) {
      expect(seedSql).toContain(`('${slug}'`);
      expect(seedSql).toContain(
        `'${displayName}', null, null, ${price}, true)`,
      );
    }
    expect(seedSql).toContain("on conflict (slug) do nothing");
  });

  it("defines date, money, and double-booking constraints", () => {
    expect(schemaSql).toContain("daily_rate_php integer not null check");
    expect(schemaSql).toContain("end_at > start_at");
    expect(schemaSql).toContain(
      "bookings_no_active_overlap exclude using gist",
    );
    expect(schemaSql).toContain("pg_advisory_xact_lock");
  });

  it("forces RLS and does not grant anonymous private-table access", () => {
    expect(rlsSql).toContain(
      "alter table public.customers force row level security",
    );
    expect(rlsSql).toContain(
      "alter table public.payments force row level security",
    );
    expect(rlsSql).not.toMatch(
      /grant\s+select[^;]+public\.customers\s+to\s+anon/i,
    );
    expect(rlsSql).not.toMatch(
      /grant\s+select[^;]+public\.payments\s+to\s+anon/i,
    );
  });

  it("adds governed specification and media metadata without uploading assets", () => {
    expect(catalogContentSql).toContain("specification_status");
    expect(catalogContentSql).toContain("license_status");
    expect(catalogContentSql).toContain("motorcycle-catalog");
    expect(catalogContentSql).toContain("private.is_active_admin()");
    expect(catalogContentSql).not.toMatch(
      /insert into public\.motorcycle_media/i,
    );
  });

  it("publishes only verified media with an approved license basis", () => {
    expect(mediaPolicySql).toContain("verification_status = 'verified'");
    expect(mediaPolicySql).toContain(
      "'business_owned', 'licensed', 'permission_granted'",
    );
    expect(mediaPolicySql).toContain("license_source_url is not null");
    expect(mediaPolicySql).toContain("license_note is not null");
  });

  it("corrects the NMAX label additively without changing its price", () => {
    expect(nmaxCorrectionSql).toContain("Yamaha NMAX 155 V3");
    expect(nmaxCorrectionSql).toContain("where slug = 'yamaha-nmax-155cc'");
    expect(nmaxCorrectionSql).not.toContain("daily_rate_php");
  });
});

describe("Phase 5 migration", () => {
  it("keeps identity storage private and owner-scoped", () => {
    expect(bookingSql).toContain(
      "'identity-verification', 'identity-verification', false",
    );
    expect(bookingSql).toContain("identity_documents_owner_insert");
    expect(bookingSql).not.toMatch(
      /grant\s+(insert|update|delete)[^;]+to\s+anon/i,
    );
  });
  it("controls availability and confirmation in database functions", () => {
    expect(bookingSql).toContain("pg_advisory_xact_lock");
    expect(bookingSql).toContain("admin_confirm_booking");
    expect(bookingSql).toContain("v_verification <> 'approved'");
    expect(bookingSql).toContain("motorcycle_unavailability");
  });
  it("requires approved business policy rather than inventing one", () => {
    expect(bookingSql).toContain("partial_day_policy text check");
    expect(bookingSql).toContain("Booking pricing policy is not configured");
    expect(bookingSql).toContain("retention_policy text");
  });
  it("uses the verified constraint for the verification upsert hotfix", () => {
    expect(bookingHotfixSql).toContain(
      "on conflict on constraint customer_verifications_booking_id_key",
    );
    expect(bookingHotfixSql).not.toContain("on conflict (booking_id)");
    expect(bookingHotfixSql).toContain("security definer");
    expect(bookingHotfixSql).toContain("set search_path = ''");
    expect(bookingHotfixSql).not.toMatch(
      /drop\s+(table|column)|truncate|delete\s+from/i,
    );
  });
  it("keeps public booking disabled by default in the settings migration", () => {
    expect(bookingSettingsSql).toContain(
      "public_booking_enabled boolean not null default false",
    );
    expect(bookingSettingsSql).toContain("policies_approved_by");
    expect(bookingSettingsSql).not.toMatch(
      /drop\s+table|truncate|delete\s+from/i,
    );
  });
  it("finalizes booking safety without weakening overlap or admin checks", () => {
    expect(bookingFinalizationSql).toContain(
      "booking_inventory_holds_no_overlap",
    );
    expect(bookingFinalizationSql).toContain("for update skip locked");
    expect(bookingFinalizationSql).toContain("pg_advisory_xact_lock");
    expect(bookingFinalizationSql).toContain("expire_pending_bookings");
    expect(bookingFinalizationSql).toContain("private.is_active_admin()");
    expect(bookingFinalizationSql).toContain(
      "Every required verification check must be approved",
    );
    expect(bookingFinalizationSql).not.toMatch(/drop\s+table|truncate/i);
  });
  it("treats midnight closing as the following-day boundary", () => {
    expect(midnightHoursSql).toContain("v_start - interval '1 day'");
    expect(midnightHoursSql).toContain("v_end - interval '1 day'");
    expect(midnightHoursSql).toContain("= '00:00'");
    expect(midnightHoursSql).not.toMatch(
      /drop\s+table|truncate|delete\s+from/i,
    );
  });
  it("restricts developer booking to administrator-authorized tester accounts", () => {
    expect(developerTestingSql).toContain(
      "developer_testing_enabled boolean not null default false",
    );
    expect(developerTestingSql).toContain(
      "private.is_active_booking_tester(auth.uid())",
    );
    expect(developerTestingSql).toContain("admin_set_developer_booking_tester");
    expect(developerTestingSql).toContain("private.is_active_admin()");
    expect(developerTestingSql).toContain("auth.jwt() ->> 'is_anonymous'");
    expect(developerTestingSql).toContain(
      "Administrator accounts cannot be developer tester accounts",
    );
    expect(developerTestingSql).toContain(
      "Use a dedicated account with no production customer record",
    );
    expect(developerTestingSql).not.toMatch(/access_codes|redeem_developer/i);
    expect(developerTestingSql).toMatch(
      /update public\.booking_settings set public_booking_enabled\s*=\s*false/,
    );
    expect(developerTestingSql).toContain(
      "check (not (public_booking_enabled and developer_testing_enabled))",
    );
    expect(developerTestingSql).toContain("new.is_test := true");
    expect(developerTestingSql).toContain(
      "select booking.is_test into new.is_test",
    );
    expect(developerTestingSql).not.toMatch(
      /disable row level security|grant all/i,
    );
  });
  it("removes developer testing without opening public booking", () => {
    expect(removeDeveloperTestingSql).toContain(
      "set public_booking_enabled = false",
    );
    expect(removeDeveloperTestingSql).toContain(
      "drop table if exists public.booking_testers",
    );
    expect(removeDeveloperTestingSql).toContain(
      "drop function if exists public.can_use_developer_booking()",
    );
    expect(removeDeveloperTestingSql).toContain(
      "drop column if exists developer_testing_enabled",
    );
    expect(removeDeveloperTestingSql).toContain(
      "not v_settings.public_booking_enabled or v_settings.policies_approved_at is null",
    );
    expect(removeDeveloperTestingSql).toContain(
      "values(v_reference,v_customer_id,p_model_id,p_start_at,p_end_at,'pending'",
    );
    expect(removeDeveloperTestingSql).not.toMatch(
      /disable row level security|grant all|truncate|delete\s+from/i,
    );
  });
  it("binds private uploads to an owned active booking and matching verification", () => {
    expect(documentIntegritySql).toContain(
      "foreign key (verification_id, booking_id)",
    );
    expect(documentIntegritySql).toContain(
      "array_length(storage.foldername(name), 1) = 2",
    );
    expect(documentIntegritySql).toContain(
      "customer.auth_user_id = (select auth.uid())",
    );
    expect(documentIntegritySql).toContain(
      "booking.status in ('submitted', 'pending')",
    );
    expect(documentIntegritySql).toContain("object.name = storage_path");
    expect(documentIntegritySql).not.toMatch(
      /disable row level security|grant all|truncate|delete\s+from/i,
    );
  });
  it("uses expiring admin-authorized accounts for synthetic booking tests", () => {
    expect(restrictedTestAccountsSql).toContain("private.is_active_admin()");
    expect(restrictedTestAccountsSql).toContain("expires_at > now()");
    expect(restrictedTestAccountsSql).toContain("revoked_at is null");
    expect(restrictedTestAccountsSql).toContain("within seven days");
    expect(restrictedTestAccountsSql).toContain(
      "Anonymous accounts cannot be authorized testers",
    );
    expect(restrictedTestAccountsSql).toContain(
      "Administrator accounts cannot be booking testers",
    );
    expect(restrictedTestAccountsSql).toContain("new.is_test:=true");
    expect(restrictedTestAccountsSql).toContain(
      "booking.is_test into new.is_test",
    );
    expect(restrictedTestAccountsSql).not.toMatch(
      /public_booking_enabled\s*=\s*true/i,
    );
    expect(restrictedTestAccountsSql).not.toMatch(
      /disable row level security|grant all/i,
    );
  });
  it("prices optional extras on the server and preserves immutable booking snapshots", () => {
    expect(bookingExtrasSql).toContain("private.calculate_extras_total");
    expect(bookingExtrasSql).toContain("extra.is_available");
    expect(bookingExtrasSql).toContain("name_snapshot");
    expect(bookingExtrasSql).toContain("price_php_snapshot");
    expect(bookingExtrasSql).toContain(
      "quoted_total_php=base_total_php+extras_total_php",
    );
    expect(bookingExtrasSql).toContain("private.is_active_admin()");
    expect(bookingExtrasSql).toContain("force row level security");
    expect(bookingExtrasSql).toContain("pg_advisory_xact_lock");
    expect(bookingExtrasSql).not.toMatch(
      /public_booking_enabled\s*=\s*true|disable row level security|truncate/i,
    );
  });
  it("prepares quantity-safe extras and provider-neutral payments without enabling a gateway", () => {
    expect(phase6Sql).toContain("private.calculate_extra_selection");
    expect(phase6Sql).toContain("for update");
    expect(phase6Sql).toContain("insufficient inventory");
    expect(phase6Sql).toContain("line_total_centavos");
    expect(phase6Sql).toContain("create table public.payment_intents");
    expect(phase6Sql).toContain("create table public.payment_attempts");
    expect(phase6Sql).toContain("create table public.payment_events");
    expect(phase6Sql).toContain("private.is_active_admin()");
    expect(phase6Sql).toContain("Payment exceeds the outstanding balance");
    expect(phase6Sql).toContain("order by value->>'id'");
    expect(phase6Sql).toContain("other.booking_id<>p_booking_id");
    expect(phase6Sql).toContain(
      "Insufficient extras inventory for the requested schedule",
    );
    expect(phase6Sql).toContain("admin_record_payment_adjustment");
    expect(phase6Sql).toContain(
      "Adjustment exceeds remaining refundable amount",
    );
    expect(phase6Sql).toContain(
      "Idempotency key was reused with different payment parameters",
    );
    expect(phase6Sql).toContain("Invalid payment intent status transition");
    expect(phase6Sql).toContain("Financial events are immutable");
    expect(phase6Sql).toContain("derive_financial_test_provenance");
    expect(phase6Sql).not.toMatch(/public_booking_enabled\s*=\s*true/i);
    expect(phase6Sql).not.toMatch(/card_number|cvv|client_secret/i);
  });
});
