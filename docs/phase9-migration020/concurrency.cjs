/* eslint-disable @typescript-eslint/no-require-imports -- Actual simultaneous disposable PostgreSQL transactions. */
const fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID: id } = require("node:crypto");
const { client, ref } = require("./connection.cjs");
const admin = id(),
  a = id(),
  b = id(),
  tag = admin.slice(0, 8),
  results = [],
  runs = [],
  setup = client();
let model,
  unit,
  extra,
  policy,
  originalSettings,
  fixtureCommitted = false;
const occurred = "2026-10-01T16:01:00Z";
function ok(name, pass, detail) {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) throw Error(name);
}
function finding(name, pass, detail) {
  results.push({ name, status: pass ? "PASS" : "FAIL", detail });
  if (!pass) process.exitCode = 1;
}
async function claims(c, user) {
  await c.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: user, role: "authenticated", is_anonymous: false }),
  ]);
}
async function one(user, sql, args) {
  const c = client();
  try {
    await c.connect();
    await c.query("begin");
    await c.query(
      "set local role authenticated;set local statement_timeout='15s'",
    );
    await claims(c, user);
    const r = await c.query(sql, args);
    await c.query("commit");
    return r.rows;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}
async function race(name, operations) {
  const cs = operations.map(() => client());
  try {
    await Promise.all(cs.map((c) => c.connect()));
    const pids = await Promise.all(
      cs.map(async (c, i) => {
        await c.query("begin");
        const role = operations[i].role || "authenticated";
        if (!["authenticated", "service_role"].includes(role))
          throw Error("Unexpected test role");
        await c.query(
          "set local role " + role + ";set local statement_timeout='15s'",
        );
        await claims(c, operations[i].user);
        return (await c.query("select pg_backend_pid() pid")).rows[0].pid;
      }),
    );
    ok(
      name + " uses distinct simultaneous PostgreSQL backends",
      new Set(pids).size === cs.length,
      pids,
    );
    const outcomes = await Promise.allSettled(
      cs.map(async (c, i) => {
        const op = operations[i];
        try {
          const r = await c.query(op.sql, op.args);
          await c.query("commit");
          return r.rows;
        } catch (e) {
          await c.query("rollback");
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
              message: r.reason.message,
              code: r.reason.code,
            },
      ),
    });
    return outcomes;
  } finally {
    await Promise.all(cs.map((c) => c.end()));
  }
}
const submitSql =
  "select * from public.submit_booking_request_v3(" +
  Array.from({ length: 21 }, (_, i) => "$" + (i + 1)).join(",") +
  ")";
function parameters(user, key, month = "07") {
  return [
    key,
    model,
    `2034-${month}-10T01:00:00Z`,
    `2034-${month}-11T01:00:00Z`,
    JSON.stringify([{ id: extra, quantity: 1 }]),
    "Synthetic " + tag,
    `${user}@example.invalid`,
    "+639000000000",
    "PH",
    "philippine_resident",
    "Synthetic Identity",
    "Synthetic Licence",
    "PH",
    "2038-01-01",
    "A",
    null,
    true,
    true,
    "cash",
    policy,
    null,
  ];
}
const eventSql =
  "select public.admin_record_security_deposit_event($1,$2,$3,$4,$5,$6,$7) id";
function event(book, type, amount, key = id()) {
  return {
    user: admin,
    sql: eventSql,
    args: [
      book.booking_id,
      type,
      amount,
      occurred,
      "Synthetic concurrent " + type,
      key,
      true,
    ],
  };
}
const paySql =
  "select public.admin_record_offline_payment($1,$2,$3,$4,$5,$6,$7) id";
const inspectSql =
  "select public.admin_record_rental_inspection($1,$2,$3,$4) id";
function inspection(book, kind, key = id()) {
  return {
    user: admin,
    sql: inspectSql,
    args: [
      book.booking_id,
      kind,
      {
        occurred_at:
          kind === "handover" ? "2026-10-01T16:02:00Z" : "2026-10-02T16:03:00Z",
        odometer_km: kind === "handover" ? 100 : 120,
        fuel_percent: 75,
        condition_notes: "Synthetic checked",
        accessories_notes: "Synthetic helmet",
        existing_damage_notes: "Synthetic no existing observations",
        new_damage_notes: "Synthetic no new observations",
        identity_checked: true,
        accessories_checked: true,
      },
      key,
    ],
  };
}
async function execute(op) {
  return one(op.user, op.sql, op.args);
}
async function denied(name, op, pattern) {
  try {
    await execute(op);
    throw Error("Unexpected success");
  } catch (e) {
    ok(name, pattern.test(e.message), e.message);
  }
}
async function approveFixture(book, owner, confirm = true) {
  await setup.query("begin");
  await claims(setup, admin);
  await setup.query(
    "update public.customer_verifications set identity_status='approved',license_status='approved',entitlement_status='approved',international_status='not_applicable',overall_status='approved' where booking_id=$1",
    [book.booking_id],
  );
  for (const kind of ["government_id", "drivers_license_front"]) {
    const storage = `${owner}/${book.booking_id}/${id()}.pdf`;
    await setup.query(
      "insert into storage.objects(bucket_id,name,owner_id,metadata) values('identity-verification',$1,$2,$3)",
      [storage, owner, { mimetype: "application/pdf", size: 64 }],
    );
    await setup.query(
      "insert into public.verification_documents(verification_id,booking_id,owner_user_id,document_kind,storage_path,mime_type,size_bytes) values($1,$2,$3,$4,$5,'application/pdf',64)",
      [book.verification_id, book.booking_id, owner, kind, storage],
    );
  }
  await setup.query("commit");
  if (confirm)
    await one(admin, "select public.admin_confirm_booking($1,$2)", [
      book.booking_id,
      unit,
    ]);
}
async function ledger(book) {
  return (
    await setup.query(
      "select (select coalesce(sum(case event_type when 'payment' then amount_centavos else -amount_centavos end),0)::int from public.payment_events where booking_id=$1) rental_net,(select coalesce(sum(case event_type when 'cash_collected' then amount_centavos when 'cash_returned' then -amount_centavos else 0 end),0)::int from public.security_deposit_events where booking_id=$1) cash_held,(select count(*)::int from public.security_deposit_events where booking_id=$1 and event_type='cash_collected') collections,(select count(*)::int from public.security_deposit_events where booking_id=$1 and event_type='cash_returned') returns",
      [book.booking_id],
    )
  ).rows[0];
}
(async () => {
  try {
    await setup.connect();
    const schema = (
      await setup.query(
        "select version from supabase_migrations.schema_migrations where version='202610110020'",
      )
    ).rows;
    ok("Committed 020 schema required", schema.length === 1);
    originalSettings = (
      await setup.query("select * from public.security_deposit_settings")
    ).rows[0];
    ok(
      "ID deposit stays disabled outside rollback-only legal-policy tests",
      originalSettings.id_enabled === false &&
        originalSettings.id_legal_approved_at === null,
    );
    await setup.query("begin");
    for (const user of [admin, a, b])
      await setup.query(
        "insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at,is_anonymous) values($1,'authenticated','authenticated',$2,'synthetic',now(),now(),false)",
        [user, `${user}@example.invalid`],
      );
    await setup.query(
      "insert into public.admin_users(auth_user_id,role,is_active) values($1,'administrator',true)",
      [admin],
    );
    for (const user of [a, b])
      await setup.query(
        "insert into public.booking_test_authorizations(auth_user_id,authorized_by,expires_at) values($1,$2,now()+interval '1 day')",
        [user, admin],
      );
    await claims(setup, admin);
    await setup.query(
      "select public.admin_save_security_deposit_settings($1)",
      [
        {
          cash_enabled: true,
          cash_amount_centavos: 12345,
          cash_policy_approved: true,
          id_enabled: false,
          id_legal_approved: false,
          accepted_document_types: [],
          collection_instructions: "Synthetic concurrent collection policy",
          return_instructions: "Synthetic concurrent return policy",
          dispute_instructions: "Synthetic concurrent dispute policy",
          partial_cash_return_allowed: true,
        },
      ],
    );
    policy = (
      await setup.query(
        "select updated_at::text from public.security_deposit_settings",
      )
    ).rows[0].updated_at;
    model = (
      await setup.query(
        "insert into public.motorcycle_models(slug,brand,model_name,display_name,daily_rate_php,is_published) values($1,'Synthetic','Synthetic','Synthetic concurrency fixture',499,true) returning id",
        ["synthetic-p9-concurrency-" + tag],
      )
    ).rows[0].id;
    await setup.query("select public.admin_set_motorcycle_quantity($1,1,0)", [
      model,
    ]);
    unit = (
      await setup.query(
        "select id from public.motorcycle_units where motorcycle_model_id=$1",
        [model],
      )
    ).rows[0].id;
    extra = (
      await setup.query(
        "insert into public.booking_extras_catalog(name,description,price_php,is_available,is_active,pricing_model,total_quantity,max_per_booking) values($1,'Synthetic concurrent fixture',13,true,true,'per_rental',1,1) returning id",
        ["Synthetic P9 concurrency " + tag],
      )
    ).rows[0].id;
    await setup.query("commit");
    fixtureCommitted = true;
    const sameArgs = parameters(a, id());
    const retry = await race("Concurrent v3 booking retry", [
      { user: a, sql: submitSql, args: sameArgs },
      { user: a, sql: submitSql, args: sameArgs },
    ]);
    ok(
      "Concurrent booking retries share one booking",
      retry.every((r) => r.status === "fulfilled") &&
        retry[0].value[0].booking_id === retry[1].value[0].booking_id,
    );
    const book = retry[0].value[0];
    ok(
      "Single snapshot and hold after concurrent booking",
      (
        await setup.query(
          "select count(*)::int n from public.booking_deposits where booking_id=$1",
          [book.booking_id],
        )
      ).rows[0].n === 1 &&
        (
          await setup.query(
            "select count(*)::int n from public.booking_inventory_holds where booking_id=$1",
            [book.booking_id],
          )
        ).rows[0].n === 1,
    );
    const last = await race("Concurrent last-unit and last-extra submissions", [
      { user: a, sql: submitSql, args: parameters(a, id(), "08") },
      { user: b, sql: submitSql, args: parameters(b, id(), "08") },
    ]);
    ok(
      "Exactly one customer reserves last inventory",
      last.filter((r) => r.status === "fulfilled").length === 1 &&
        last.filter((r) => r.status === "rejected").length === 1,
    );
    const lastWinner = last.find((r) => r.status === "fulfilled").value[0],
      lastOwner = last[0].status === "fulfilled" ? a : b;
    ok(
      "Failed booking leaves no orphan snapshot",
      (
        await setup.query(
          "select count(*)::int n from public.booking_deposits d left join public.bookings bk on bk.id=d.booking_id where bk.id is null",
        )
      ).rows[0].n === 0,
    );
    await approveFixture(book, a);
    await denied(
      "Pickup without required cash payment rolls back inspection",
      inspection(book, "handover"),
      /cash rental payment/,
    );
    ok(
      "Failed unpaid pickup persists no inspection",
      (
        await setup.query(
          "select count(*)::int n from public.rental_inspections where booking_id=$1",
          [book.booking_id],
        )
      ).rows[0].n === 0,
    );
    const payArgs = [
      book.booking_id,
      book.rental_total_centavos,
      "cash",
      "SYN-P9-RACE-" + tag,
      occurred,
      "Synthetic verified cash",
      id(),
    ];
    const pays = await race("Concurrent cash rental payment retry", [
      { user: admin, sql: paySql, args: payArgs },
      { user: admin, sql: paySql, args: payArgs },
    ]);
    finding(
      "Cash payment retries share one payment intent",
      pays.every((r) => r.status === "fulfilled") &&
        pays[0].value[0].id === pays[1].value[0].id,
    );
    await denied(
      "Pickup without required deposit rolls back",
      inspection(book, "handover"),
      /deposit arrangement/,
    );
    const collectOps = [
      event(book, "cash_collected", 12345),
      event(book, "cash_collected", 12345),
    ];
    const collections = await race(
      "Concurrent deposit collection distinct keys",
      collectOps,
    );
    ok(
      "Only one deposit collection commits",
      collections.filter((r) => r.status === "fulfilled").length === 1 &&
        collections.filter((r) => r.status === "rejected").length === 1,
    );
    const winningCollect =
      collectOps[collections[0].status === "fulfilled" ? 0 : 1];
    const repeated = await race(
      "Concurrent deposit collection identical retries",
      [winningCollect, winningCollect],
    );
    ok(
      "Collection idempotency returns original event",
      repeated.every((r) => r.status === "fulfilled") &&
        repeated[0].value[0].id === repeated[1].value[0].id,
    );
    ok(
      "Rental and deposit ledgers remain separate",
      (await ledger(book)).rental_net === book.rental_total_centavos &&
        (await ledger(book)).cash_held === 12345 &&
        (await ledger(book)).collections === 1,
    );
    const hands = await race("Concurrent physical handover", [
      inspection(book, "handover"),
      inspection(book, "handover"),
    ]);
    ok(
      "One handover succeeds; second rolls back",
      hands.filter((r) => r.status === "fulfilled").length === 1 &&
        hands.filter((r) => r.status === "rejected").length === 1,
    );
    ok(
      "One immutable handover inspection",
      (
        await setup.query(
          "select count(*)::int n from public.rental_inspections where booking_id=$1 and kind='handover'",
          [book.booking_id],
        )
      ).rows[0].n === 1,
    );
    await execute(inspection(book, "return"));
    const returnOps = [
      event(book, "cash_returned", 9000),
      event(book, "cash_returned", 9000),
    ];
    const returns = await race(
      "Concurrent excessive combined refunds",
      returnOps,
    );
    ok(
      "Combined refunds cannot exceed collected cash",
      returns.filter((r) => r.status === "fulfilled").length === 1 &&
        returns.filter((r) => r.status === "rejected").length === 1,
    );
    let l = await ledger(book);
    ok(
      "Failed excess refund leaves correct liability and revenue",
      l.cash_held === 3345 &&
        l.returns === 1 &&
        l.rental_net === book.rental_total_centavos,
      l,
    );
    const winningReturn = returnOps[returns[0].status === "fulfilled" ? 0 : 1];
    const returnRetry = await race("Concurrent identical refund retries", [
      winningReturn,
      winningReturn,
    ]);
    ok(
      "Refund retry returns original immutable event",
      returnRetry.every((r) => r.status === "fulfilled") &&
        returnRetry[0].value[0].id === returnRetry[1].value[0].id,
    );
    await execute(event(book, "cash_returned", 3345));
    await one(
      admin,
      "select public.admin_transition_booking_with_reason($1,'completed',null)",
      [book.booking_id],
    );
    l = await ledger(book);
    ok(
      "Completed rental fully reconciles",
      l.cash_held === 0 &&
        l.rental_net === book.rental_total_centavos &&
        l.collections === 1 &&
        l.returns === 2,
      l,
    );
    const receipt = (
      await setup.query(
        "select id from public.payment_events where booking_id=$1 and event_type='payment'",
        [book.booking_id],
      )
    ).rows[0].id;
    const adjustSql =
      "select public.admin_record_payment_adjustment($1,$2,$3,$4,$5,$6,$7,$8) id";
    const refundArgs = [
      receipt,
      "refund",
      book.rental_total_centavos,
      "cash",
      "SYN-P9-FULL-REF-" + tag,
      "2026-10-02T16:04:00Z",
      "Synthetic verified full rental refund",
      id(),
    ];
    const rentalRefunds = await race(
      "Concurrent full rental-refund identical retry",
      [
        { user: admin, sql: adjustSql, args: refundArgs },
        { user: admin, sql: adjustSql, args: refundArgs },
      ],
    );
    finding(
      "Full rental refund retries share one adjustment intent",
      rentalRefunds.every((r) => r.status === "fulfilled") &&
        rentalRefunds[0].value[0].id === rentalRefunds[1].value[0].id,
    );
    const afterRentalRefund = await ledger(book);
    ok(
      "Rental refund commits once without changing deposit accounting",
      afterRentalRefund.rental_net === 0 &&
        afterRentalRefund.cash_held === 0 &&
        (
          await setup.query(
            "select count(*)::int n from public.payment_events where booking_id=$1 and event_type='refund'",
            [book.booking_id],
          )
        ).rows[0].n === 1,
      afterRentalRefund,
    );
    await approveFixture(lastWinner, lastOwner);
    await execute(event(lastWinner, "cash_collected", 12345));
    await one(
      admin,
      "select public.admin_transition_booking_with_reason($1,'cancelled','Synthetic concurrency cancellation')",
      [lastWinner.booking_id],
    );
    ok(
      "Cancellation keeps unresolved deposit obligation",
      (await ledger(lastWinner)).cash_held === 12345,
    );
    const cancelledReturns = await race("Concurrent cancellation refunds", [
      event(lastWinner, "cash_returned", 7000),
      event(lastWinner, "cash_returned", 7000),
    ]);
    ok(
      "Cancellation refunds cannot overdraw",
      cancelledReturns.filter((r) => r.status === "fulfilled").length === 1 &&
        cancelledReturns.filter((r) => r.status === "rejected").length === 1,
    );
    await execute(event(lastWinner, "cash_returned", 5345));
    ok(
      "Cancelled booking deposit reconciles without rental revenue",
      (await ledger(lastWinner)).cash_held === 0 &&
        (await ledger(lastWinner)).rental_net === 0,
    );
    const expired = (await one(a, submitSql, parameters(a, id(), "09")))[0];
    await approveFixture(expired, a, false);
    await setup.query(
      "update public.bookings set expires_at=now()-interval '1 minute' where id=$1",
      [expired.booking_id],
    );
    const expiredRace = await race("Confirmation versus expiration worker", [
      {
        user: admin,
        sql: "select public.admin_confirm_booking($1,$2)",
        args: [expired.booking_id, unit],
      },
      {
        user: admin,
        role: "service_role",
        sql: "select public.expire_pending_bookings()",
        args: [],
      },
    ]); // Uses the existing service-only expiration grant.
    ok(
      "Service-role expiration worker participates successfully",
      expiredRace[1].status === "fulfilled",
    );
    ok(
      "Expired confirmation cannot succeed",
      expiredRace[0].status === "rejected" &&
        /not active|Expired/.test(expiredRace[0].reason.message),
    );
    await setup.query("select public.expire_pending_bookings()");
    ok(
      "Expiration releases reservation",
      (
        await setup.query("select status from public.bookings where id=$1", [
          expired.booking_id,
        ])
      ).rows[0].status === "expired" &&
        (
          await setup.query(
            "select count(*)::int n from public.booking_inventory_holds where booking_id=$1 and released_at is null",
            [expired.booking_id],
          )
        ).rows[0].n === 0,
    );
    await denied(
      "Customer cannot manage deposit events",
      { ...event(book, "case_opened", 0), user: a },
      /Administrator/,
    );
    await denied(
      "Financial history cannot be altered by customer",
      {
        user: a,
        sql: "update public.security_deposit_events set amount_centavos=1 where booking_id=$1",
        args: [book.booking_id],
      },
      /permission/,
    );
    ok(
      "Synthetic provenance preserved in both ledgers",
      (
        await setup.query(
          "select bool_and(is_test) ok from (select is_test from public.payment_events where booking_id=$1 union all select is_test from public.security_deposit_events where booking_id=$1) x",
          [book.booking_id],
        )
      ).rows[0].ok === true,
    );
  } catch (e) {
    await setup.query("rollback").catch(() => {});
    results.push({
      name: "Fatal test failure",
      status: "FAIL",
      detail: e.message,
    });
    process.exitCode = 1;
  } finally {
    try {
      if (originalSettings && fixtureCommitted) {
        await setup.query("begin");
        await claims(setup, admin);
        await setup.query(
          "select public.admin_save_security_deposit_settings($1)",
          [
            {
              cash_enabled: originalSettings.cash_enabled,
              cash_amount_centavos: originalSettings.cash_amount_centavos,
              cash_policy_approved:
                originalSettings.cash_policy_approved_at !== null,
              id_enabled: false,
              id_legal_approved: false,
              id_legal_reference: originalSettings.id_legal_reference,
              accepted_document_types: originalSettings.accepted_document_types,
              collection_instructions: originalSettings.collection_instructions,
              return_instructions: originalSettings.return_instructions,
              dispute_instructions: originalSettings.dispute_instructions,
              partial_cash_return_allowed:
                originalSettings.partial_cash_return_allowed,
            },
          ],
        );
        await setup.query("commit");
        const flags = (
          await setup.query(
            "select cash_enabled,id_enabled from public.security_deposit_settings",
          )
        ).rows[0];
        ok(
          "Cash and ID options restored to disabled defaults",
          flags.cash_enabled === false && flags.id_enabled === false,
        );
        ok(
          "Public booking stays disabled",
          (
            await setup.query(
              "select public_booking_enabled from public.booking_settings",
            )
          ).rows[0].public_booking_enabled === false,
        );
      }
    } catch (e) {
      results.push({
        name: "Settings restoration",
        status: "FAIL",
        detail: e.message,
      });
      process.exitCode = 1;
    }
    await setup.end();
    const report = {
      project: ref,
      productionContacted: false,
      fixtureTag: tag,
      results,
      runs,
      syntheticFixturesRetained: true,
      modelSpecificAmounts: "Not implemented; default policy only",
    };
    fs.writeFileSync(
      path.join(__dirname, "concurrency-results.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  }
})();
