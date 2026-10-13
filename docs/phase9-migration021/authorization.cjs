/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID: id } = require("node:crypto");
const { client, ref } = require("./connection.cjs");
(async () => {
  const c = client(),
    results = [];
  try {
    await c.connect();
    await c.query("begin");
    const fixture = (
      await c.query(
        "select i.id,i.created_by,i.idempotency_key,i.request_fingerprint f from public.payment_intents i join public.bookings b on b.id=i.booking_id join public.motorcycle_models m on m.id=b.motorcycle_model_id where b.is_test and i.kind='charge' and m.slug like 'synthetic-p9-concurrency-%' limit 1",
      )
    ).rows[0];
    if (!fixture) throw Error("Synthetic receipt required");
    await c.query(
      "update public.admin_users set is_active=false where auth_user_id=$1",
      [fixture.created_by],
    );
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: fixture.created_by,
        role: "authenticated",
        is_anonymous: false,
      }),
    ]);
    await c.query("set local role authenticated");
    const f = fixture.f;
    for (const [name, sql, args] of [
      [
        "Suspended administrator cannot retry successful payment",
        "select public.admin_record_offline_payment($1,$2,$3,$4,$5,$6,$7)",
        [
          f.booking_id,
          f.amount_centavos,
          f.method,
          f.transaction_reference,
          f.occurred_at,
          "Synthetic security retry",
          fixture.idempotency_key,
        ],
      ],
      [
        "Suspended administrator cannot adjust payments",
        "select public.admin_record_payment_adjustment($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id(),
          "refund",
          1,
          "cash",
          "SYN-P21-AUTH",
          "2026-10-11T00:00:00Z",
          "Synthetic authorization check",
          id(),
        ],
      ],
      [
        "Suspended administrator cannot manage deposits",
        "select public.admin_record_security_deposit_event($1,$2,$3,$4,$5,$6,$7)",
        [
          f.booking_id,
          "case_opened",
          0,
          "2026-10-11T00:00:00Z",
          "Synthetic authorization check",
          id(),
          true,
        ],
      ],
    ]) {
      await c.query("savepoint denied");
      try {
        await c.query(sql, args);
        throw Error("Unexpected authorization success");
      } catch (e) {
        await c.query("rollback to savepoint denied");
        if (!/Administrator access required/.test(e.message)) throw e;
        results.push({ name, status: "PASS" });
      }
      await c.query("release savepoint denied");
    }
    await c.query("rollback");
    fs.writeFileSync(
      path.join(__dirname, "authorization-results.json"),
      JSON.stringify(
        {
          project: ref,
          results,
          authorizationChangesRolledBack: true,
          productionContacted: false,
        },
        null,
        2,
      ),
    );
    console.log("Authorization regressions: " + results.length + " passed");
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
