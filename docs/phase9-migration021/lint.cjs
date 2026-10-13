/* eslint-disable @typescript-eslint/no-require-imports -- plpgsql_check diagnostics with extension rolled back. */
const fs = require("node:fs"),
  path = require("node:path");
const { client, ref } = require("./connection.cjs");
(async () => {
  const c = client();
  try {
    await c.connect();
    await c.query("begin");
    await c.query("set local statement_timeout='30s'");
    await c.query(
      "create extension if not exists plpgsql_check with schema extensions",
    );
    const sql = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../supabase/migrations/202610110020_cash_deposits_and_rental_operations.sql",
      ),
      "utf8",
    );
    const names = [
      ...sql.matchAll(/create function (public|private)\.(\w+)/g),
    ].map((m) => m[2]);
    names.push(
      "admin_record_offline_payment",
      "admin_record_payment_adjustment",
    );
    const diagnostics = (
      await c.query(
        "select n.nspname schema,p.proname function,t.tgrelid::regclass::text trigger_table,d.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang left join pg_trigger t on t.tgfoid=p.oid and not t.tgisinternal cross join lateral extensions.plpgsql_check_function_tb(p.oid::regprocedure,coalesce(t.tgrelid,0)::regclass,fatal_errors=>false,performance_warnings=>false,security_warnings=>true) d where n.nspname in ('public','private') and l.lanname='plpgsql' and p.proname=any($1::text[])",
        [names],
      )
    ).rows;
    const functions = (
      await c.query(
        "select n.nspname schema,p.proname function,p.prosecdef security_definer,p.proconfig configuration,has_function_privilege('anon',p.oid,'execute') anon_execute,has_function_privilege('authenticated',p.oid,'execute') authenticated_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname=any($1::text[])",
        [names],
      )
    ).rows;
    const tables = (
      await c.query(
        "select relname,relrowsecurity rls,relforcerowsecurity forced,has_table_privilege('anon',oid,'insert,update,delete') anon_mutations,has_table_privilege('authenticated',oid,'insert,update,delete') authenticated_mutations from pg_class where relnamespace='public'::regnamespace and relname=any($1::text[])",
        [
          [
            "security_deposit_settings",
            "booking_deposits",
            "security_deposit_events",
            "rental_inspections",
          ],
        ],
      )
    ).rows;
    await c.query("rollback");
    const present = (
      await c.query(
        "select count(*)::int n from pg_extension where extname='plpgsql_check'",
      )
    ).rows[0].n;
    const report = {
      project: ref,
      tool: "Actual PostgreSQL plpgsql_check (diagnostic extension installed only inside rolled-back transaction)",
      diagnostics,
      errors: diagnostics.filter((d) => d.level === "error"),
      functions,
      tables,
      lintExtensionRetained: present > 0,
    };
    fs.writeFileSync(
      path.join(__dirname, "database-lint.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (
      report.errors.length ||
      tables.some(
        (t) =>
          !t.rls || !t.forced || t.anon_mutations || t.authenticated_mutations,
      ) ||
      functions.some(
        (f) => !f.configuration?.some((s) => s.startsWith("search_path=")),
      )
    )
      process.exitCode = 1;
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
