/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID: id } = require("node:crypto");
const { client, ref } = require("./connection.cjs");
const ids = [
  "a0691878-4824-413a-bbb3-6ee2c61dfc1e",
  "61623aee-9d40-4269-a9e1-4d9a7ef5c671",
  "b5b21007-541d-4049-af35-c4f143169b17",
  "e6dc6d60-3c08-4239-8e4e-3daf00b92e5b",
];
(async () => {
  const c = client(),
    results = [];
  try {
    await c.connect();
    const allFixtures = (
      await c.query(
        "select b.id from public.bookings b join public.motorcycle_models m on m.id=b.motorcycle_model_id where m.slug like 'synthetic-p9-concurrency-%' and b.is_test",
      )
    ).rows;
    for (const row of allFixtures) if (!ids.includes(row.id)) ids.push(row.id);
    await c.query("begin");
    const actor = (
      await c.query(
        "select s.updated_by from public.security_deposit_settings s join public.admin_users a on a.auth_user_id=s.updated_by and a.is_active join auth.users u on u.id=a.auth_user_id where u.email like '%@example.invalid'",
      )
    ).rows[0]?.updated_by;
    if (!actor) throw Error("Synthetic active administrator required");
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: actor,
        role: "authenticated",
        is_anonymous: false,
      }),
    ]);
    for (const booking of ids) {
      const b = (
        await c.query(
          "select b.id,b.status,b.is_test,u.email from public.bookings b join public.customers customer on customer.id=b.customer_id join auth.users u on u.id=customer.auth_user_id where b.id=$1",
          [booking],
        )
      ).rows[0];
      if (!b?.is_test || !b.email.endsWith("@example.invalid"))
        throw Error("Non-synthetic fixture refused");
      await c.query("set local role authenticated");
      if (["pending", "confirmed"].includes(b.status))
        await c.query(
          "select public.admin_transition_booking_with_reason($1,'cancelled',$2)",
          [booking, "Synthetic interrupted-test reconciliation"],
        );
      await c.query("reset role");
      const held = (
        await c.query(
          "select coalesce(sum(case event_type when 'cash_collected' then amount_centavos when 'cash_returned' then -amount_centavos else 0 end),0)::int n from public.security_deposit_events where booking_id=$1",
          [booking],
        )
      ).rows[0].n;
      await c.query("set local role authenticated");
      if (held > 0)
        await c.query(
          "select public.admin_record_security_deposit_event($1,$2,$3,$4,$5,$6,$7)",
          [
            booking,
            "cash_returned",
            held,
            "2026-10-11T06:00:00Z",
            "Synthetic interrupted-test deposit reconciliation",
            id(),
            true,
          ],
        );
      await c.query("reset role");
      const payments = (
        await c.query(
          "select p.id,p.amount_centavos-coalesce((select sum(r.amount_centavos) from public.payment_events r where r.original_payment_event_id=p.id),0)::int remaining from public.payment_events p where booking_id=$1 and event_type='payment'",
          [booking],
        )
      ).rows;
      await c.query("set local role authenticated");
      for (const p of payments)
        if (p.remaining > 0)
          await c.query(
            "select public.admin_record_payment_adjustment($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              p.id,
              "refund",
              p.remaining,
              "cash",
              "SYN-P21-RECON-" + p.id,
              "2026-10-11T06:00:00Z",
              "Synthetic interrupted-test rental reconciliation",
              id(),
            ],
          );
      await c.query("reset role");
      results.push({
        bookingId: booking,
        cashReturned: held,
        rentalRefunded: payments.reduce((n, p) => n + p.remaining, 0),
        synthetic: true,
      });
    }
    await c.query("commit");
    fs.writeFileSync(
      path.join(__dirname, "prior-fixture-reconciliation.json"),
      JSON.stringify(
        {
          project: ref,
          results,
          recordsDeleted: false,
          productionContacted: false,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify(results, null, 2));
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
