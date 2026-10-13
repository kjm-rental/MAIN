/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { client, ref } = require("../phase9-migration021/connection.cjs");
(async () => {
  const c = client();
  try {
    await c.connect();
    await c.query("begin read only");
    const history = (
      await c.query(
        "select version from supabase_migrations.schema_migrations order by version",
      )
    ).rows;
    const pending = fs
      .readdirSync(path.resolve(__dirname, "../../supabase/migrations"))
      .filter(
        (f) =>
          f.endsWith(".sql") &&
          !history.some((h) => f.startsWith(h.version + "_")),
      );
    const settings = (
      await c.query(
        "select public_booking_enabled,timezone from public.booking_settings",
      )
    ).rows;
    const deposits = (
      await c.query(
        "select cash_enabled,id_enabled from public.security_deposit_settings",
      )
    ).rows;
    const existing = (
      await c.query(
        "select to_regclass('public.notification_outbox') outbox,to_regclass('public.notification_settings') settings",
      )
    ).rows[0];
    const sequence = (
      await c.query(
        "select relname,has_sequence_privilege('anon',oid,'USAGE,SELECT,UPDATE') anon_access,has_sequence_privilege('authenticated',oid,'USAGE,SELECT,UPDATE') authenticated_access from pg_class where relkind='S' and relnamespace='public'::regnamespace",
      )
    ).rows;
    const defaults = (
      await c.query(
        "select pg_get_userbyid(defaclrole) owner,defaclnamespace::regnamespace::text schema,defaclobjtype type,defaclacl::text acl from pg_default_acl where defaclnamespace='public'::regnamespace",
      )
    ).rows;
    const dependencies = (
      await c.query(
        "select name,to_regclass(name)::text relation from unnest(array['public.bookings','public.customers','public.motorcycle_models','public.booking_deposits','public.verification_documents','public.customer_verifications','public.payment_events','public.security_deposit_events','public.rental_inspections','public.audit_logs']) name",
      )
    ).rows;
    const adminHelper = (
      await c.query(
        "select p.prosecdef,p.proconfig from pg_proc p where p.oid='private.is_active_admin()'::regprocedure",
      )
    ).rows[0];
    if (
      dependencies.some((row) => !row.relation) ||
      !adminHelper.prosecdef ||
      !adminHelper.proconfig.includes('search_path=""')
    )
      throw Error("Migration dependency or authorization helper drift");
    const sql = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../supabase/migrations/202610110022_transactional_notification_outbox.sql",
      ),
      "utf8",
    );
    if (
      ref !== "uuxjymzrtncrnnkvdpjy" ||
      history.length !== 21 ||
      history.at(-1).version !== "202610110021" ||
      pending.length !== 1 ||
      !pending[0].startsWith("202610110022_") ||
      existing.outbox ||
      existing.settings ||
      settings.some((s) => s.public_booking_enabled) ||
      sequence.some((s) => s.anon_access || s.authenticated_access)
    )
      throw Error("Preflight state failed");
    await c.query("rollback");
    const report = {
      project: ref,
      readOnly: true,
      history,
      pending,
      settings,
      deposits,
      existing,
      sequence,
      defaults,
      migration022Sha256: crypto.createHash("sha256").update(sql).digest("hex"),
      dependencies,
      adminHelper,
      productionContacted: false,
      migrationApplied: false,
    };
    fs.writeFileSync(
      path.join(__dirname, "remote-state.json"),
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
