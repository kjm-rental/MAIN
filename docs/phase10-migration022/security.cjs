/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  path = require("node:path");
const { client, ref } = require("./connection.cjs");
(async () => {
  const c = client(),
    results = [];
  const ok = (name, pass) => {
    results.push({ name, status: pass ? "PASS" : "FAIL" });
    if (!pass) throw Error(name);
  };
  try {
    await c.connect();
    await c.query("begin");
    const tables = (
      await c.query(
        "select relname,relrowsecurity,relforcerowsecurity,has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') anon_access,has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE') client_writes,has_table_privilege('service_role',oid,'INSERT,UPDATE,DELETE') service_direct_writes from pg_class where relnamespace='public'::regnamespace and relname=any($1)",
        [
          [
            "notification_outbox",
            "notification_settings",
            "notification_generation_errors",
          ],
        ],
      )
    ).rows;
    ok(
      "All three notification tables force RLS and deny direct writes",
      tables.length === 3 &&
        tables.every(
          (t) =>
            t.relrowsecurity &&
            t.relforcerowsecurity &&
            !t.anon_access &&
            !t.client_writes &&
            !t.service_direct_writes,
        ),
    );
    const sql = fs.readFileSync(
        path.resolve(
          __dirname,
          "../../supabase/migrations/202610110022_transactional_notification_outbox.sql",
        ),
        "utf8",
      ),
      names = [...sql.matchAll(/create function (\w+)\.(\w+)/g)].map(
        (m) => m[2],
      );
    const functions = (
      await c.query(
        "select n.nspname schema,p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_exec,has_function_privilege('service_role',p.oid,'EXECUTE') service_exec from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname=any($1)",
        [names],
      )
    ).rows;
    ok(
      "All 12 definers use empty search_path; effective role grants are correct",
      functions.length === 12 &&
        functions.every(
          (f) =>
            f.prosecdef &&
            f.proconfig.includes('search_path=""') &&
            !f.anon_exec &&
            f.authenticated_exec === f.proname.startsWith("admin_") &&
            f.service_exec === f.proname.startsWith("notification_"),
        ),
    );
    const sequences = (
      await c.query(
        "select relname,has_sequence_privilege('anon',oid,'USAGE,SELECT,UPDATE') anon_access,has_sequence_privilege('authenticated',oid,'USAGE,SELECT,UPDATE') authenticated_access from pg_class where relkind='S' and relnamespace='public'::regnamespace",
      )
    ).rows;
    ok(
      "No new sequences; existing deposit sequence stays restricted",
      sequences.length === 1 &&
        sequences.every((s) => !s.anon_access && !s.authenticated_access),
    );
    for (const role of ["anon", "authenticated"])
      for (const [name, statement] of Object.entries({
        claim: "select * from public.notification_claim('resend',true)",
        schedule: "select public.notification_schedule_reminders()",
        advance:
          "select nextval('public.security_deposit_events_sequence_seq')",
        read: "select last_value from public.security_deposit_events_sequence_seq",
        reset: "select setval('public.security_deposit_events_sequence_seq',1)",
        insert:
          "insert into public.notification_outbox(event_key) values('unauthorized')",
        update: "update public.notification_outbox set status='sent'",
        delete: "delete from public.notification_outbox",
      })) {
        await c.query("savepoint denied");
        await c.query("set local role " + role);
        let denied = false;
        try {
          await c.query(statement);
        } catch (e) {
          denied = e.code === "42501";
        }
        await c.query("rollback to savepoint denied");
        ok(role + " denied " + name, denied);
      }
    await c.query("rollback");
    const report = {
      project: ref,
      results,
      tables,
      functions,
      sequences,
      productionContacted: false,
    };
    fs.writeFileSync(
      path.join(__dirname, "security-results.json"),
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
