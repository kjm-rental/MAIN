/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { client, ref } = require("./connection.cjs");
(async () => {
  const c = client();
  try {
    await c.connect();
    await c.query("begin read only");
    const fixture = require("./concurrency-results.json").fixture;
    const q = async (s, p) => (await c.query(s, p)).rows;
    const report = {
      project: ref,
      productionContacted: false,
      migrations: await q(
        "select version from supabase_migrations.schema_migrations order by version",
      ),
      settings: await q(
        "select telegram_enabled,resend_enabled,reminders_approved from public.notification_settings",
      ),
      publicBooking: await q(
        "select public_booking_enabled from public.booking_settings",
      ),
      outbox: await q(
        "select event_type,channel,status,is_test,simulated,attempt_count from public.notification_outbox where booking_id=$1 order by event_type,channel",
        [fixture.booking],
      ),
      duplicates: await q(
        "select event_key,channel,recipient_reference,count(*) from public.notification_outbox group by event_key,channel,recipient_reference having count(*)>1",
      ),
      rentalLedger: await q(
        "select count(*)::int events,sum(case event_type when 'payment' then amount_centavos else -amount_centavos end)::int net_centavos from public.payment_events where booking_id=$1",
        [fixture.booking],
      ),
      depositLedger: await q(
        "select count(*)::int events,sum(case event_type when 'cash_collected' then amount_centavos when 'cash_returned' then -amount_centavos else 0 end)::int held_centavos from public.security_deposit_events where booking_id=$1",
        [fixture.booking],
      ),
      generationErrors: await q(
        "select count(*)::int count from public.notification_generation_errors",
      ),
      lintExtensionRetained: await q(
        "select count(*)::int count from pg_extension where extname='plpgsql_check'",
      ),
    };
    await c.query("rollback");
    const baseline = JSON.parse(
      fs.readFileSync("/tmp/kjm-022-preservation-baseline.json", "utf8"),
    );
    report.preservation = Object.fromEntries(
      Object.entries(baseline).map(([f, h]) => [
        f,
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.resolve(__dirname, "../../..", f)))
          .digest("hex") === h,
      ]),
    );
    fs.writeFileSync(
      path.join(__dirname, "reconciliation.json"),
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
