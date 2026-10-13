/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { client, ref } = require("./connection.cjs");
const dir = path.resolve(__dirname, "../../supabase/migrations");
const file = "202610110021_deposit_sequence_and_payment_idempotency.sql";
const sql = fs.readFileSync(path.join(dir, file), "utf8");
const digest = (s) => crypto.createHash("sha256").update(s).digest("hex");
(async () => {
  const c = client();
  try {
    await c.connect();
    await c.query("begin");
    await c.query(
      "set local lock_timeout='10s';set local statement_timeout='30s';select pg_advisory_xact_lock(hashtextextended('kjm-migration021',0))",
    );
    const history = (
      await c.query(
        "select version from supabase_migrations.schema_migrations order by version",
      )
    ).rows;
    if (
      ref !== "uuxjymzrtncrnnkvdpjy" ||
      history.length !== 20 ||
      history.at(-1).version !== "202610110020"
    )
      throw Error("Unexpected disposable migration history");
    const pending = fs
      .readdirSync(dir)
      .filter(
        (f) =>
          f.endsWith(".sql") &&
          !history.some((h) => f.startsWith(h.version + "_")),
      );
    if (JSON.stringify(pending) !== JSON.stringify([file]))
      throw Error("Unexpected pending migrations");
    const original = fs.readFileSync(
      path.join(dir, "202610110020_cash_deposits_and_rental_operations.sql"),
      "utf8",
    );
    if (
      digest(original) !==
      "1014e63dbedcd818e5abca60f370f490effbd07416951928a673aaf96757e6e2"
    )
      throw Error("Applied migration 020 source changed");
    const sequences = (
      await c.query(
        "select c.relname,pg_get_userbyid(c.relowner) owner,c.relacl::text acl,has_sequence_privilege('anon',c.oid,'USAGE,SELECT,UPDATE') anon_access,has_sequence_privilege('authenticated',c.oid,'USAGE,SELECT,UPDATE') authenticated_access from pg_class c where c.relkind='S' and c.relnamespace='public'::regnamespace",
      )
    ).rows;
    const defaults = (
      await c.query(
        "select pg_get_userbyid(defaclrole) owner,defaclnamespace::regnamespace::text namespace,defaclobjtype type,defaclacl::text acl from pg_default_acl where defaclobjtype='S'",
      )
    ).rows;
    const counts = async () =>
      (
        await c.query(
          "select 'bookings' entity,count(*)::int n from public.bookings union all select 'customers',count(*)::int from public.customers union all select 'models',count(*)::int from public.motorcycle_models union all select 'payments',count(*)::int from public.payment_events union all select 'deposits',count(*)::int from public.security_deposit_events",
        )
      ).rows;
    const before = await counts();
    await c.query(sql);
    const effective = (
      await c.query(
        "select r,has_sequence_privilege(r,'public.security_deposit_events_sequence_seq','USAGE') usage,has_sequence_privilege(r,'public.security_deposit_events_sequence_seq','SELECT') select_access,has_sequence_privilege(r,'public.security_deposit_events_sequence_seq','UPDATE') update_access from unnest(array['anon','authenticated']) r",
      )
    ).rows;
    if (effective.some((r) => r.usage || r.select_access || r.update_access))
      throw Error("Client retains effective sequence privilege");
    const publicGrant = (
      await c.query(
        "select count(*)::int n from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('S',c.relowner))) a where c.oid='public.security_deposit_events_sequence_seq'::regclass and a.grantee=0",
      )
    ).rows[0].n;
    if (publicGrant) throw Error("PUBLIC retains sequence grant");
    const after = await counts();
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw Error("Record counts changed");
    await c.query(
      "insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)",
      ["202610110021", "deposit_sequence_and_payment_idempotency", [sql]],
    );
    await c.query("commit");
    const report = {
      project: ref,
      committed: true,
      version: "202610110021",
      sha256: digest(sql),
      historyBefore: history,
      pending,
      sequencesBefore: sequences,
      sequenceDefaultPrivileges: defaults,
      effectiveAfter: effective,
      publicGrantsAfter: publicGrant,
      countsBefore: before,
      countsAfter: after,
      productionContacted: false,
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
