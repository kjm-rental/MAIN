/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID: id } = require("node:crypto");
const { Client } = require("/tmp/kjm-phase6-node/node_modules/pg");
// Hard-coded loopback target: this test cannot connect to either Supabase project.
const client = () =>
  new Client({
    host: "127.0.0.1",
    port: 55432,
    user: "postgres",
    database: "postgres",
    connectionTimeoutMillis: 5000,
  });
const results = [],
  runs = [],
  c = client(),
  admin = id(),
  customer = id(),
  model = id(),
  booking = id(),
  cid = id();
function ok(name, pass = true, detail) {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw Error(name);
  console.log("PASS " + name);
}
async function claims(db, user) {
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: user, role: "authenticated", is_anonymous: false }),
  ]);
}
async function race(name, ops) {
  const cs = ops.map(() => client());
  try {
    await Promise.all(cs.map((db) => db.connect()));
    const pids = await Promise.all(
      cs.map(async (db, i) => {
        await db.query("begin");
        await db.query(
          "set local statement_timeout='10s';set local role " + ops[i].role,
        );
        await claims(db, ops[i].user || admin);
        return (await db.query("select pg_backend_pid() pid")).rows[0].pid;
      }),
    );
    ok(
      name + " uses distinct simultaneous backends",
      new Set(pids).size === ops.length,
      pids,
    );
    const outcomes = await Promise.allSettled(
      cs.map(async (db, i) => {
        try {
          const r = await db.query(ops[i].sql, ops[i].args);
          await db.query("commit");
          return r.rows;
        } catch (e) {
          await db.query("rollback");
          throw e;
        }
      }),
    );
    runs.push({
      name,
      pids,
      outcomes: outcomes.map((r) =>
        r.status === "fulfilled"
          ? { status: "committed", rows: r.value }
          : {
              status: "rolled_back",
              sqlState: r.reason.code,
              error: r.reason.message,
            },
      ),
    });
    return outcomes;
  } finally {
    await Promise.all(cs.map((db) => db.end()));
  }
}
(async () => {
  try {
    await c.connect();
    // Reconcile only a prior interrupted local fixture before rerunning this harness.
    const prior = (
      await c.query(
        "select b.id,p.recorded_by,p.id payment_event,p.amount_centavos from public.bookings b join public.motorcycle_models m on m.id=b.motorcycle_model_id join public.payment_events p on p.booking_id=b.id and p.event_type='payment' where m.slug like 'synthetic-native-%' and b.is_test and b.status='pending'",
      )
    ).rows;
    for (const old of prior) {
      await c.query("begin");
      await claims(c, old.recorded_by);
      await c.query(
        "update public.bookings set deposit_required_centavos=12345 where id=$1",
        [old.id],
      );
      await c.query(
        "select public.admin_transition_booking_with_reason($1,'cancelled','Prior synthetic native harness reconciliation')",
        [old.id],
      );
      await c.query(
        "select public.admin_record_payment_adjustment($1,'refund',$2,'cash',$3,'2026-10-11T01:00:00Z','Synthetic prior fixture reconciliation',$4)",
        [old.payment_event, old.amount_centavos, "SYN-OLD-" + old.id, id()],
      );
      await c.query("commit");
    }
    await c.query(
      "update public.notification_outbox set status='cancelled',last_error='cancelled',lease_token=null,lease_until=null where status<>'sent'",
    );
    await c.query("begin");
    for (const user of [admin, customer])
      await c.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [user, user + "@example.invalid"],
      );
    await c.query(
      "insert into public.admin_users(auth_user_id,role,is_active) values($1,'administrator',true)",
      [admin],
    );
    await claims(c, admin);
    await c.query(
      "insert into public.customers(id,auth_user_id,full_name,email) values($1,$2,'Synthetic native concurrency','synthetic@example.invalid')",
      [cid, customer],
    );
    await c.query(
      "insert into public.motorcycle_models(id,slug,brand,model_name,display_name,daily_rate_php) values($1,$2,'Synthetic','Synthetic','Synthetic native concurrency',499)",
      [model, "synthetic-native-" + model.slice(0, 8)],
    );
    await c.query(
      "insert into public.bookings(id,booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,base_total_php,is_test) values($1,$2,$3,$4,now()+interval '1 day',now()+interval '2 days','pending',499,499,true)",
      [booking, "KJM-NATIVE-" + booking.slice(0, 8), cid, model],
    );
    await c.query(
      "insert into public.booking_deposits(booking_id,option,required_centavos,partial_return_allowed,collection_instructions,return_instructions,dispute_instructions,policy_version,request_fingerprint,is_test) values($1,'cash',12345,true,'Synthetic','Synthetic','Synthetic',now(),'synthetic',true)",
      [booking],
    );
    await c.query(
      "update public.bookings set deposit_required_centavos=12345 where id=$1",
      [booking],
    );
    await c.query("commit");
    const paymentKey = id(),
      paidAt = "2026-10-11T01:00:00Z",
      pay = {
        role: "authenticated",
        sql: "select public.admin_record_offline_payment($1,49900,'cash',$4, $2,'Synthetic concurrency',$3) id",
        args: [booking, paidAt, paymentKey, "SYN-NATIVE-" + booking],
      };
    const pays = await race("Full-balance payment callbacks", [pay, pay]);
    ok(
      "Both payment callbacks return original intent",
      pays.every((r) => r.status === "fulfilled") &&
        pays[0].value[0].id === pays[1].value[0].id,
    );
    const counts = (
      await c.query(
        "select (select count(*)::int from public.payment_events where booking_id=$1) payments,(select count(*)::int from public.notification_outbox where booking_id=$1 and event_type='cash_payment') notifications",
        [booking],
      )
    ).rows[0];
    ok(
      "One authoritative cash receipt generates one notification per channel",
      counts.payments === 1 && counts.notifications === 2,
      counts,
    );
    const claim = {
      role: "service_role",
      sql: "select * from public.notification_claim('resend',true)",
      args: [],
    };
    const workers = await race("Four concurrent delivery workers", [
      claim,
      claim,
      claim,
      claim,
    ]);
    const rows = workers.flatMap((r) =>
      r.status === "fulfilled" ? r.value : [],
    );
    ok(
      "Skip-locked workers never claim same logical notification",
      rows.length === 2 && new Set(rows.map((r) => r.id)).size === 2,
    );
    ok(
      "Every claim has a distinct lease and exactly one attempt",
      new Set(rows.map((r) => r.lease_token)).size === 2 &&
        rows.every((r) => r.attempt_count === 1),
    );
    const n = rows[0];
    const finish = {
      role: "service_role",
      sql: "select public.notification_finish($1,$2,'sent','mock:native')",
      args: [n.id, n.lease_token],
    };
    const finishes = await race("Competing worker completions", [
      finish,
      finish,
    ]);
    ok(
      "One completion succeeds and stale duplicate rolls back",
      finishes.filter((r) => r.status === "fulfilled").length === 1 &&
        finishes.filter(
          (r) => r.status === "rejected" && /Stale/.test(r.reason.message),
        ).length === 1,
    );
    const retry = rows[1];
    await c.query("select public.notification_finish($1,$2,'transient')", [
      retry.id,
      retry.lease_token,
    ]);
    const manual = {
      role: "authenticated",
      sql: "select public.admin_retry_notification($1)",
      args: [retry.id],
    };
    const retries = await race("Concurrent administrator manual retries", [
      manual,
      manual,
    ]);
    ok(
      "Exactly one retry action commits",
      retries.filter((r) => r.status === "fulfilled").length === 1 &&
        retries.filter((r) => r.status === "rejected").length === 1,
    );
    ok(
      "Manual retry audit is singular and attempts preserved",
      (
        await c.query(
          "select count(*)::int n from public.audit_logs where action='notifications.manual_retry' and entity_id=$1",
          [retry.id],
        )
      ).rows[0].n === 1 &&
        (
          await c.query(
            "select attempt_count from public.notification_outbox where id=$1",
            [retry.id],
          )
        ).rows[0].attempt_count === 1,
    );
    const repeated = await race(
      "Concurrent repeated payment callbacks after balance zero",
      [pay, pay],
    );
    ok(
      "Retries create no extra financial or notification events",
      repeated.every((r) => r.status === "fulfilled") &&
        (
          await c.query(
            "select count(*)::int n from public.payment_events where booking_id=$1",
            [booking],
          )
        ).rows[0].n === 1 &&
        (
          await c.query(
            "select count(*)::int n from public.notification_outbox where booking_id=$1 and event_type='cash_payment'",
            [booking],
          )
        ).rows[0].n === 2,
    );
    // Prove failed financial operations roll back and cannot generate notifications.
    const invalid = {
      ...pay,
      args: [booking, paidAt, id(), "SYN-NATIVE-" + booking],
    };
    const failures = await race("Concurrent overpayment rollback", [
      invalid,
      invalid,
    ]);
    ok(
      "Both overpayment attempts fail safely",
      failures.every(
        (r) =>
          r.status === "rejected" &&
          /outstanding balance/.test(r.reason.message),
      ),
    );
    ok(
      "Failed operations leave receipt/outbox totals unchanged",
      (
        await c.query(
          "select count(*)::int n from public.payment_events where booking_id=$1",
          [booking],
        )
      ).rows[0].n === 1 &&
        (
          await c.query(
            "select count(*)::int n from public.notification_outbox where booking_id=$1",
            [booking],
          )
        ).rows[0].n === 4,
    );
    // Local synthetic fixture reconciliation using existing actions; preserve audit history.
    await c.query("begin");
    await claims(c, admin);
    await c.query(
      "select public.admin_transition_booking_with_reason($1,'cancelled','Synthetic native test completed')",
      [booking],
    );
    const event = (
      await c.query(
        "select id from public.payment_events where booking_id=$1 and event_type='payment'",
        [booking],
      )
    ).rows[0];
    await c.query(
      "select public.admin_record_payment_adjustment($1,'refund',49900,'cash',$4,$2,'Synthetic local ledger reconciliation',$3)",
      [event.id, paidAt, id(), "SYN-NATIVE-REFUND-" + booking],
    );
    await c.query("commit");
    ok(
      "Local fixture financial ledger reconciles to zero",
      (
        await c.query(
          "select sum(case event_type when 'payment' then amount_centavos else -amount_centavos end)::int n from public.payment_events where booking_id=$1",
          [booking],
        )
      ).rows[0].n === 0,
    );
    ok(
      "No real notifications delivered",
      (
        await c.query(
          "select count(*)::int n from public.notification_outbox where status='sent' and not simulated",
        )
      ).rows[0].n === 0,
    );
  } catch (e) {
    await c.query("rollback").catch(() => {});
    results.push({
      name: "Native concurrency failure",
      status: "FAIL",
      detail: e.message,
    });
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
    fs.writeFileSync(
      path.join(__dirname, "native-concurrency-results.json"),
      JSON.stringify(
        {
          engine:
            "Native PostgreSQL 18.4 on loopback; no Supabase project contacted",
          results,
          runs,
          externalProviderCalls: false,
        },
        null,
        2,
      ),
    );
  }
})();
