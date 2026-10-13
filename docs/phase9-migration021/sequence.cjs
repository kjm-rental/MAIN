/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  path = require("node:path");
const { client, ref } = require("./connection.cjs");
(async () => {
  const c = client(),
    results = [];
  try {
    await c.connect();
    const sequences = (
      await c.query(
        "select c.relname,pg_get_userbyid(c.relowner) owner,c.relacl::text acl from pg_class c where c.relkind='S' and c.relnamespace='public'::regnamespace",
      )
    ).rows;
    if (
      sequences.length !== 1 ||
      sequences[0].relname !== "security_deposit_events_sequence_seq"
    )
      throw Error("Unexpected public sequences require audit");
    for (const role of ["anon", "authenticated"])
      for (const [name, sql] of Object.entries({
        advance:
          "select nextval('public.security_deposit_events_sequence_seq')",
        read: "select last_value from public.security_deposit_events_sequence_seq",
        current:
          "select currval('public.security_deposit_events_sequence_seq')",
        reset: "select setval('public.security_deposit_events_sequence_seq',1)",
      })) {
        await c.query("begin");
        await c.query("set local role " + role);
        try {
          await c.query(sql);
          throw Error("Unexpected sequence access");
        } catch (e) {
          if (e.code !== "42501") throw e;
          results.push({
            name: role + " cannot " + name,
            status: "PASS",
            sqlState: e.code,
          });
        } finally {
          await c.query("rollback");
        }
      }
    const grants = (
      await c.query(
        "select r,has_sequence_privilege(r,'public.security_deposit_events_sequence_seq','USAGE') usage,has_sequence_privilege(r,'public.security_deposit_events_sequence_seq','SELECT') read,has_sequence_privilege(r,'public.security_deposit_events_sequence_seq','UPDATE') update from unnest(array['anon','authenticated','service_role','postgres']) r",
      )
    ).rows;
    fs.writeFileSync(
      path.join(__dirname, "sequence-results.json"),
      JSON.stringify(
        {
          project: ref,
          results,
          sequences,
          effectivePrivileges: grants,
          productionContacted: false,
        },
        null,
        2,
      ),
    );
    console.log("Sequence regressions: " + results.length + " passed");
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
