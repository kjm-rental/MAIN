/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { client, ref } = require("./connection.cjs");
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
(async () => {
  const c = client();
  try {
    await c.connect();
    const history = (
      await c.query(
        "select version,name,statements from supabase_migrations.schema_migrations order by version",
      )
    ).rows;
    const hashes = history
      .filter((r) => ["202610110020", "202610110021"].includes(r.version))
      .map((r) => ({
        version: r.version,
        databaseHash: hash(r.statements.join("")),
        fileHash: hash(
          fs.readFileSync(
            path.resolve(
              __dirname,
              "../../supabase/migrations",
              r.version + "_" + r.name + ".sql",
            ),
          ),
        ),
      }));
    if (
      history.length !== 21 ||
      hashes.some((r) => r.databaseHash !== r.fileHash)
    )
      throw Error("Migration history or hash mismatch");
    const baseline = JSON.parse(
      fs.readFileSync(path.join(__dirname, "baseline.json"), "utf8"),
    );
    const unchanged = Object.entries(baseline).map(([file, expected]) => ({
      file,
      unchanged:
        hash(fs.readFileSync(path.resolve(__dirname, "../../..", file))) ===
        expected,
    }));
    if (unchanged.some((r) => !r.unchanged))
      throw Error("Applied migration or environment file changed");
    const settings = (
      await c.query(
        "select public_booking_enabled,pending_hold_minutes,pending_expiration_minutes,timezone from public.booking_settings",
      )
    ).rows[0];
    const depositDefaults = (
      await c.query(
        "select cash_enabled,id_enabled,cash_amount_centavos,id_legal_approved_at,accepted_document_types from public.security_deposit_settings",
      )
    ).rows[0];
    const ledgers = (
      await c.query(
        "select b.id,b.status,b.is_test,b.total_centavos,(select coalesce(sum(case event_type when 'payment' then amount_centavos else -amount_centavos end),0)::int from public.payment_events where booking_id=b.id) rental_net,(select coalesce(sum(case event_type when 'cash_collected' then amount_centavos when 'cash_returned' then -amount_centavos else 0 end),0)::int from public.security_deposit_events where booking_id=b.id) cash_held,(select count(*)::int from public.payment_intents where booking_id=b.id) intents,(select count(*)::int from public.payment_events where booking_id=b.id) events,(select count(*)::int from public.payment_attempts a join public.payment_intents i on i.id=a.payment_intent_id where i.booking_id=b.id) attempts from public.bookings b join public.motorcycle_models m on m.id=b.motorcycle_model_id where m.slug like 'synthetic-p9-concurrency-%' order by b.created_at",
      )
    ).rows;
    if (
      settings.public_booking_enabled ||
      depositDefaults.cash_enabled ||
      depositDefaults.id_enabled
    )
      throw Error("Test flags not restored");
    if (
      ledgers.some(
        (r) =>
          !r.is_test ||
          r.rental_net !== 0 ||
          r.cash_held !== 0 ||
          r.intents !== r.events ||
          r.intents !== r.attempts ||
          !["cancelled", "completed", "expired"].includes(r.status),
      )
    )
      throw Error("Synthetic fixture reconciliation incomplete");
    const duplicateKeys = (
      await c.query(
        "select count(*)::int n from (select idempotency_key from public.payment_intents group by idempotency_key having count(*)>1) x",
      )
    ).rows[0].n;
    if (duplicateKeys) throw Error("Duplicate financial idempotency keys");
    const sequence = (
      await c.query(
        "select r,has_sequence_privilege(r,'public.security_deposit_events_sequence_seq','USAGE,SELECT,UPDATE') access from unnest(array['anon','authenticated']) r",
      )
    ).rows;
    if (sequence.some((r) => r.access))
      throw Error("Sequence permissions regressed");
    const report = {
      project: ref,
      appliedVersions: history.map((r) => r.version),
      hashes,
      unchanged,
      settings,
      depositDefaults,
      ledgers,
      duplicateFinancialKeys: duplicateKeys,
      sequence,
      productionContacted: false,
      recordsDeleted: false,
    };
    fs.writeFileSync(
      path.join(__dirname, "postflight.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
