/* eslint-disable @typescript-eslint/no-require-imports -- Approved disposable-only atomic migration. */
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { client, ref } = require("./connection.cjs");
(async () => {
  const c = client();
  try {
    await c.connect();
    await c.query("begin");
    await c.query(
      "set local lock_timeout='10s'; set local statement_timeout='30s'",
    );
    await c.query(
      "select pg_advisory_xact_lock(hashtextextended('kjm-approved-migration020',0))",
    );
    const before = JSON.parse(
      fs.readFileSync(path.join(__dirname, "preflight.json"), "utf8"),
    );
    const history = (
      await c.query(
        "select version from supabase_migrations.schema_migrations order by version",
      )
    ).rows.map((r) => r.version);
    if (
      ref !== before.project ||
      history.length !== 19 ||
      JSON.stringify(history) !==
        JSON.stringify(before.applied.map((r) => r.version))
    )
      throw Error("Preflight migration history changed");
    const sql = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/migrations", before.pending[0]),
      "utf8",
    );
    if (crypto.createHash("sha256").update(sql).digest("hex") !== before.sha256)
      throw Error("Reviewed migration changed");
    await c.query(sql);
    const counts = (
      await c.query(
        "select 'customers' entity,count(*)::int n from public.customers union all select 'bookings',count(*)::int from public.bookings union all select 'motorcycle_models',count(*)::int from public.motorcycle_models union all select 'motorcycle_units',count(*)::int from public.motorcycle_units union all select 'payment_events',count(*)::int from public.payment_events",
      )
    ).rows;
    if (JSON.stringify(counts) !== JSON.stringify(before.recordCounts))
      throw Error("Existing record counts changed");
    const settings = (
      await c.query(
        "select public_booking_enabled,pending_hold_minutes,pending_expiration_minutes,timezone from public.booking_settings",
      )
    ).rows;
    if (JSON.stringify(settings) !== JSON.stringify(before.settings))
      throw Error("Existing booking settings changed");
    const defaults = (
      await c.query(
        "select cash_enabled,id_enabled,cash_amount_centavos,id_legal_approved_at from public.security_deposit_settings",
      )
    ).rows[0];
    if (
      defaults.cash_enabled ||
      defaults.id_enabled ||
      defaults.cash_amount_centavos !== null ||
      defaults.id_legal_approved_at !== null
    )
      throw Error("Unsafe deposit defaults");
    await c.query(
      "insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)",
      ["202610110020", "cash_deposits_and_rental_operations", [sql]],
    );
    await c.query("commit");
    const report = {
      project: ref,
      version: "202610110020",
      sha256: before.sha256,
      committed: true,
      executedAt: new Date().toISOString(),
      countsBefore: before.recordCounts,
      countsAfter: counts,
      settingsUnchanged: true,
      defaults,
      productionContacted: false,
      authConfigurationModified: false,
    };
    fs.writeFileSync(
      path.join(__dirname, "deployment.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
