/* eslint-disable @typescript-eslint/no-require-imports -- Disposable read-only preflight. */
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { client, ref } = require("./connection.cjs");
(async () => {
  const c = client();
  try {
    await c.connect();
    const files = fs
      .readdirSync(path.resolve(__dirname, "../../supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const applied = (
      await c.query(
        "select version,name from supabase_migrations.schema_migrations order by version",
      )
    ).rows;
    const pending = files.filter(
      (f) => !applied.some((a) => f.startsWith(a.version + "_")),
    );
    if (
      applied.length !== 19 ||
      files.length !== 20 ||
      pending.length !== 1 ||
      !pending[0].startsWith("202610110020_") ||
      files
        .slice(0, 19)
        .some((f) => !applied.some((a) => f.startsWith(a.version + "_")))
    )
      throw Error("Expected exactly applied 001–019 and pending 020");
    const sql = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/migrations", pending[0]),
      "utf8",
    );
    const report = {
      project: ref,
      executedAt: new Date().toISOString(),
      applied,
      pending,
      sha256: crypto.createHash("sha256").update(sql).digest("hex"),
      destructiveStatements:
        /\b(drop\s+(table|column|schema)|truncate|delete\s+from)\b/i.test(sql),
      settings: (
        await c.query(
          "select public_booking_enabled,pending_hold_minutes,pending_expiration_minutes,timezone from public.booking_settings",
        )
      ).rows,
      recordCounts: (
        await c.query(
          "select 'customers' entity,count(*)::int n from public.customers union all select 'bookings',count(*)::int from public.bookings union all select 'motorcycle_models',count(*)::int from public.motorcycle_models union all select 'motorcycle_units',count(*)::int from public.motorcycle_units union all select 'payment_events',count(*)::int from public.payment_events",
        )
      ).rows,
      schemaHistoryColumns: (
        await c.query(
          "select column_name,data_type from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations'",
        )
      ).rows,
    };
    if (
      report.destructiveStatements ||
      report.settings[0].public_booking_enabled !== false
    )
      throw Error("Destructive statement or public switch concern");
    fs.writeFileSync(
      path.join(__dirname, "preflight.json"),
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
