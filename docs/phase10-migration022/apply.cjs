/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { client, ref } = require("./connection.cjs");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
(async () => {
  const c = client();
  try {
    await c.connect();
    await c.query("begin");
    await c.query(
      "set local lock_timeout='10s';set local statement_timeout='30s';select pg_advisory_xact_lock(hashtextextended('kjm-approved-022',0))",
    );
    const history = (
      await c.query(
        "select version from supabase_migrations.schema_migrations order by version",
      )
    ).rows;
    const dir = path.resolve(__dirname, "../../supabase/migrations"),
      pending = fs
        .readdirSync(dir)
        .filter(
          (f) =>
            f.endsWith(".sql") &&
            !history.some((h) => f.startsWith(h.version + "_")),
        );
    if (
      ref !== "uuxjymzrtncrnnkvdpjy" ||
      history.length !== 21 ||
      history.at(-1).version !== "202610110021" ||
      pending.length !== 1 ||
      pending[0] !== "202610110022_transactional_notification_outbox.sql"
    )
      throw Error("Disposable target/history differs from approved preflight");
    const sql = fs.readFileSync(path.join(dir, pending[0]), "utf8");
    if (
      sha(sql) !==
      "b962b9fb4cde2c72345dfec7571c52ce4c56cec5064c08f2c634918b58715917"
    )
      throw Error("Reviewed migration changed");
    const counts = async () =>
      (
        await c.query(
          "select 'customers' entity,count(*)::int n from public.customers union all select 'bookings',count(*)::int from public.bookings union all select 'models',count(*)::int from public.motorcycle_models union all select 'payments',count(*)::int from public.payment_events union all select 'deposits',count(*)::int from public.security_deposit_events",
        )
      ).rows;
    const before = await counts(),
      flags = (
        await c.query(
          "select public_booking_enabled from public.booking_settings",
        )
      ).rows;
    if (flags.some((f) => f.public_booking_enabled))
      throw Error("Public booking restriction changed");
    await c.query(sql);
    const after = await counts();
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw Error("Existing records changed");
    const settings = (
      await c.query("select * from public.notification_settings")
    ).rows[0];
    if (
      settings.telegram_enabled ||
      settings.resend_enabled ||
      settings.reminders_approved
    )
      throw Error("Unsafe notification defaults");
    await c.query(
      "insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)",
      ["202610110022", "transactional_notification_outbox", [sql]],
    );
    await c.query("commit");
    const report = {
      project: ref,
      version: "202610110022",
      sha256: sha(sql),
      committed: true,
      historyBefore: history,
      pendingBefore: pending,
      countsBefore: before,
      countsAfter: after,
      notificationDefaults: settings,
      publicBookingEnabled: false,
      productionContacted: false,
      realProviderCalls: false,
      executedAt: new Date().toISOString(),
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
