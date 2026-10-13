/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  path = require("node:path");
const { client, ref } = require("./connection.cjs");
(async () => {
  const c = client();
  try {
    await c.connect();
    await c.query("begin");
    await c.query(
      "set local statement_timeout='30s';create extension if not exists plpgsql_check with schema extensions",
    );
    const sql = fs.readFileSync(
        path.resolve(
          __dirname,
          "../../supabase/migrations/202610110022_transactional_notification_outbox.sql",
        ),
        "utf8",
      ),
      names = [...sql.matchAll(/create function \w+\.(\w+)/g)].map((m) => m[1]);
    const diagnostics = (
      await c.query(
        "select n.nspname schema,p.proname function,t.tgrelid::regclass::text trigger_table,d.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang left join pg_trigger t on t.tgfoid=p.oid and not t.tgisinternal cross join lateral extensions.plpgsql_check_function_tb(p.oid::regprocedure,coalesce(t.tgrelid,0)::regclass,fatal_errors=>false,performance_warnings=>false,security_warnings=>true) d where n.nspname in ('public','private') and l.lanname='plpgsql' and p.proname=any($1)",
        [names],
      )
    ).rows;
    await c.query("rollback");
    const report = {
      project: ref,
      tool: "Actual PostgreSQL plpgsql_check; diagnostic extension installation rolled back",
      diagnostics,
      errors: diagnostics.filter((d) => d.level === "error"),
      productionContacted: false,
    };
    fs.writeFileSync(
      path.join(__dirname, "lint-results.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length) process.exitCode = 1;
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
