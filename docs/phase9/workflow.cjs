/* eslint-disable @typescript-eslint/no-require-imports -- Disposable rollback-only SQL acceptance test. */
const fs = require("node:fs"),
  path = require("node:path"),
  { randomUUID: id } = require("node:crypto");
const { Client } = require("/tmp/kjm-phase6-node/node_modules/pg");
const meta = "/tmp/kjm-phase6-supabase.bwb60x/supabase/.temp",
  ref = fs.readFileSync(path.join(meta, "project-ref"), "utf8").trim();
const url = new URL(
  fs.readFileSync(path.join(meta, "pooler-url"), "utf8").trim(),
);
if (
  ref !== "uuxjymzrtncrnnkvdpjy" ||
  !decodeURIComponent(url.username).includes(ref) ||
  url.toString().includes("slevojynuumrvgiznmxk")
)
  throw Error("Disposable target required");
url.password = fs
  .readFileSync("/tmp/kjm-phase6-test-db-password", "utf8")
  .trim();
const c = new Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});
const results = [],
  admin = id(),
  customer = id(),
  outsider = id();
let model, unit, extra, policy;
function ok(name, condition = true) {
  if (!condition) throw Error(name);
  results.push({ name, status: "PASS" });
}
async function claims(user) {
  await c.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: user, role: "authenticated", is_anonymous: false }),
  ]);
}
async function denied(name, sql, args, match) {
  await c.query("savepoint rejection");
  try {
    await c.query(sql, args);
    throw Error("Unexpected success");
  } catch (e) {
    await c.query("rollback to savepoint rejection");
    if (!match.test(e.message)) throw e;
    ok(name);
  } finally {
    await c.query("release savepoint rejection");
  }
}
const settings = {
  cash_enabled: true,
  cash_amount_centavos: 12345,
  cash_policy_approved: true,
  id_enabled: false,
  id_legal_approved: false,
  id_legal_reference: "",
  accepted_document_types: [],
  collection_instructions: "Synthetic collection policy",
  return_instructions: "Synthetic return policy",
  dispute_instructions: "Synthetic dispute policy",
  partial_cash_return_allowed: false,
};
async function configure(overrides = {}) {
  await claims(admin);
  await c.query("select public.admin_save_security_deposit_settings($1)", [
    { ...settings, ...overrides },
  ]);
  policy = (
    await c.query(
      "select updated_at::text from public.security_deposit_settings",
    )
  ).rows[0].updated_at;
}
async function quote(option = "cash", document = null) {
  await claims(customer);
  return (
    await c.query(
      "select *,policy_version::text from public.get_booking_quote_v3($1,$2,$3,$4,$5,$6)",
      [
        model,
        "2033-06-10T01:00:00Z",
        "2033-06-11T01:00:00Z",
        JSON.stringify([{ id: extra, quantity: 1 }]),
        option,
        document,
      ],
    )
  ).rows[0];
}
function args(key, option = "cash", document = null, version = policy) {
  return [
    key,
    model,
    "2033-06-10T01:00:00Z",
    "2033-06-11T01:00:00Z",
    JSON.stringify([{ id: extra, quantity: 1 }]),
    "Synthetic Phase 9",
    `${customer}@example.invalid`,
    "+639000000000",
    "PH",
    "philippine_resident",
    "Synthetic Identity",
    "Synthetic Licence",
    "PH",
    "2035-01-01",
    "A",
    null,
    true,
    true,
    option,
    version,
    document,
  ];
}
const submitSql =
  "select * from public.submit_booking_request_v3(" +
  Array.from({ length: 21 }, (_, i) => "$" + (i + 1)).join(",") +
  ")";
async function submit(option = "cash", document = null) {
  const q = await quote(option, document);
  policy = q.policy_version;
  const parameters = args(id(), option, document);
  const result = (await c.query(submitSql, parameters)).rows[0];
  return { ...result, parameters };
}
async function verification(b) {
  await claims(admin);
  await denied(
    "Approval without verification rejected",
    "select public.admin_confirm_booking($1,$2)",
    [b.booking_id, unit],
    /verification/,
  );
  await c.query(
    "update public.customer_verifications set identity_status='approved',license_status='approved',entitlement_status='approved',international_status='not_applicable',overall_status='approved' where booking_id=$1",
    [b.booking_id],
  );
  await denied(
    "Approval without private documents rejected",
    "select public.admin_confirm_booking($1,$2)",
    [b.booking_id, unit],
    /document/,
  );
  for (const kind of ["government_id", "drivers_license_front"]) {
    const storage = `${customer}/${b.booking_id}/${id()}.pdf`;
    await c.query(
      "insert into storage.objects(bucket_id,name,owner_id,metadata) values('identity-verification',$1,$2,$3)",
      [storage, customer, { mimetype: "application/pdf", size: 64 }],
    );
    await c.query(
      "insert into public.verification_documents(verification_id,booking_id,owner_user_id,document_kind,storage_path,mime_type,size_bytes) values($1,$2,$3,$4,$5,'application/pdf',64)",
      [b.verification_id, b.booking_id, customer, kind, storage],
    );
  }
  await c.query("select public.admin_confirm_booking($1,$2)", [
    b.booking_id,
    unit,
  ]);
  ok("Verified approval reserves assigned motorcycle");
  const r = (
    await c.query(
      "select count(*)::int n from public.payment_events where booking_id=$1",
      [b.booking_id],
    )
  ).rows[0];
  ok("Approval creates no payment", r.n === 0);
}
const paySql =
  "select public.admin_record_offline_payment($1,$2,$3,$4,$5,$6,$7) id";
async function pay(b) {
  await claims(admin);
  const a = [
    b.booking_id,
    b.rental_total_centavos,
    "cash",
    "SYN-P9-" + id(),
    "2026-10-01T16:01:00Z",
    "Synthetic physically verified cash",
    id(),
  ];
  const first = (await c.query(paySql, a)).rows[0].id;
  ok(
    "Cash receipt retry returns same intent",
    (await c.query(paySql, a)).rows[0].id === first,
  );
  await denied(
    "Changed receipt retry rejected",
    paySql,
    [...a.slice(0, 1), 1, ...a.slice(2)],
    /reused with different/,
  );
  return first;
}
const eventSql =
  "select public.admin_record_security_deposit_event($1,$2,$3,$4,$5,$6,$7) id";
async function event(b, type, amount = 0, key = id()) {
  return (
    await c.query(eventSql, [
      b.booking_id,
      type,
      amount,
      "2026-10-01T16:02:00Z",
      "Synthetic verified event",
      key,
      true,
    ])
  ).rows[0].id;
}
const inspectionSql =
  "select public.admin_record_rental_inspection($1,$2,$3,$4) id";
function detail(kind) {
  return {
    occurred_at:
      kind === "handover" ? "2026-10-01T16:03:00Z" : "2026-10-02T16:04:00Z",
    odometer_km: kind === "handover" ? 100 : 120,
    fuel_percent: 75,
    condition_notes: "Synthetic checked condition",
    accessories_notes: "Synthetic extras checked",
    existing_damage_notes: "None observed in synthetic fixture",
    new_damage_notes: "None observed in synthetic fixture",
    identity_checked: true,
    accessories_checked: true,
  };
}
async function inspect(b, kind) {
  return (
    await c.query(inspectionSql, [b.booking_id, kind, detail(kind), id()])
  ).rows[0].id;
}
async function complete(b) {
  await c.query(
    "select public.admin_transition_booking_with_reason($1,'completed',null)",
    [b.booking_id],
  );
}
async function summary(b) {
  return (
    await c.query("select public.get_booking_deposit_summary($1) result", [
      b.booking_id,
    ])
  ).rows[0].result;
}
(async () => {
  try {
    await c.connect();
    await c.query("begin");
    await c.query("set local statement_timeout='15s'");
    await c.query(
      fs.readFileSync(
        path.resolve(
          __dirname,
          "../../supabase/migrations/202610110020_cash_deposits_and_rental_operations.sql",
        ),
        "utf8",
      ),
    );
    ok("Migration 020 executes without committing");
    for (const user of [admin, customer, outsider])
      await c.query(
        "insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at,is_anonymous) values($1,'authenticated','authenticated',$2,'synthetic',now(),now(),false)",
        [user, `${user}@example.invalid`],
      );
    await c.query(
      "insert into public.admin_users(auth_user_id,role,is_active) values($1,'administrator',true)",
      [admin],
    );
    await c.query(
      "insert into public.booking_test_authorizations(auth_user_id,authorized_by,expires_at) values($1,$2,now()+interval '1 day')",
      [customer, admin],
    );
    const hours = Object.fromEntries(
      [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ].map((d) => [
        d,
        {
          enabled: true,
          pickupOpen: "08:00",
          pickupClose: "00:00",
          returnOpen: "08:00",
          returnClose: "00:00",
        },
      ]),
    );
    await c.query(
      "update public.booking_settings set public_booking_enabled=false,pending_expiration_minutes=1440,pending_hold_minutes=30,operating_hours=$1,partial_day_policy='started_24_hours',partial_day_pricing_policy='charge_full_day',accepted_philippine_id_types='[\"Synthetic verification document\"]',philippine_license_policy='Synthetic approved policy',international_license_policy='Synthetic approved policy',international_policy_source_url='https://example.invalid/policy',international_policy_verified_at=current_date,privacy_notice='Synthetic notice',retention_policy='Synthetic retention',policies_approved_at=now(),policies_approved_by=$2 where id=true",
      [hours, admin],
    );
    model = (
      await c.query(
        "update public.motorcycle_models set is_published=true where id=(select id from public.motorcycle_models where archived_at is null order by slug limit 1) returning id",
      )
    ).rows[0].id;
    unit = (
      await c.query(
        "insert into public.motorcycle_units(motorcycle_model_id,internal_unit_code,status) values($1,$2,'available') returning id",
        [model, "SYN-P9-" + id()],
      )
    ).rows[0].id;
    extra = (
      await c.query(
        "insert into public.booking_extras_catalog(name,description,price_php,is_available,is_active,pricing_model,total_quantity,max_per_booking) values($1,'Synthetic',13,true,true,'per_rental',50,1) returning id",
        ["Synthetic P9 " + id()],
      )
    ).rows[0].id;
    await claims(customer);
    await denied(
      "Cash disabled until management approval",
      "select *,policy_version::text from public.get_booking_quote_v3($1,$2,$3,$4,$5,$6)",
      [model, "2033-06-10T01:00:00Z", "2033-06-11T01:00:00Z", [], "cash", null],
      /approved|available|enabled/,
    );
    await denied(
      "Ordinary customer cannot configure deposits",
      "select public.admin_save_security_deposit_settings($1)",
      [settings],
      /Administrator/,
    );
    await configure();
    await denied(
      "ID needs legal approval",
      "select public.admin_save_security_deposit_settings($1)",
      [{ ...settings, id_enabled: true }],
      /legal approval/,
    );
    const q = await quote();
    ok(
      "Quote separates rental and refundable deposit",
      Number(q.cash_due_at_pickup_centavos) === q.total_centavos + 12345,
    );
    const b = await submit();
    ok(
      "Submitted rental is pending and synthetic",
      (
        await c.query(
          "select status,is_test,deposit_required_centavos from public.bookings where id=$1",
          [b.booking_id],
        )
      ).rows[0].status === "pending",
    );
    ok(
      "Server final cash total reconciles",
      Number(b.cash_due_at_pickup_centavos) === b.rental_total_centavos + 12345,
    );
    ok(
      "Booking retry is identical",
      (await c.query(submitSql, b.parameters)).rows[0].booking_id ===
        b.booking_id,
    );
    await denied(
      "Booking retry cannot change deposit",
      submitSql,
      [...b.parameters.slice(0, 18), "eligible_id", ...b.parameters.slice(19)],
      /reused/,
    );
    await configure({ cash_amount_centavos: 23456 });
    await claims(customer);
    await denied(
      "Stale policy quote rejected",
      submitSql,
      args(id(), "cash", null, b.parameters[19]),
      /policy changed/,
    );
    ok(
      "Existing quote survives policy change",
      (await summary(b)).required_centavos === 12345,
    );
    await configure();
    await verification(b);
    await c.query(
      "update public.customer_verifications set identity_status='rejected' where booking_id=$1",
      [b.booking_id],
    );
    await denied(
      "Rejected verification blocks handover",
      inspectionSql,
      [b.booking_id, "handover", detail("handover"), id()],
      /mandatory verification/,
    );
    await c.query(
      "update public.customer_verifications set identity_status='approved',international_status='under_review' where booking_id=$1",
      [b.booking_id],
    );
    await denied(
      "Pending international review blocks handover",
      inspectionSql,
      [b.booking_id, "handover", detail("handover"), id()],
      /mandatory verification/,
    );
    await c.query(
      "update public.customer_verifications set international_status='not_applicable' where booking_id=$1",
      [b.booking_id],
    );
    await c.query("select public.admin_reschedule_booking($1,$2,$3,null)", [
      b.booking_id,
      "2033-06-12T01:00:00Z",
      "2033-06-13T01:00:00Z",
    ]);
    ok(
      "Rescheduling preserves immutable deposit quote",
      (await summary(b)).required_centavos === 12345,
    );
    await denied(
      "Unpaid handover rejected",
      inspectionSql,
      [b.booking_id, "handover", detail("handover"), id()],
      /cash rental payment/,
    );
    await denied(
      "Bank transfer receipt rejected",
      paySql,
      [
        b.booking_id,
        100,
        "bank_transfer",
        "SYN-" + id(),
        "2026-10-01T16:01:00Z",
        "Synthetic rejection",
        id(),
      ],
      /cash on pickup/,
    );
    await pay(b);
    await denied(
      "Deposit mandatory before handover",
      inspectionSql,
      [b.booking_id, "handover", detail("handover"), id()],
      /deposit arrangement/,
    );
    const key = id(),
      first = await event(b, "cash_collected", 12345, key);
    ok(
      "Deposit retry returns same event",
      (await event(b, "cash_collected", 12345, key)) === first,
    );
    await denied(
      "Deposit collection once only",
      eventSql,
      [
        b.booking_id,
        "cash_collected",
        12345,
        "2026-10-01T16:02:00Z",
        "Synthetic verified event",
        id(),
        true,
      ],
      /once/,
    );
    await inspect(b, "handover");
    ok(
      "Handover activates rental",
      (
        await c.query(
          "select status,handover_at from public.bookings where id=$1",
          [b.booking_id],
        )
      ).rows[0].status === "active",
    );
    await denied(
      "Return requires inspection",
      eventSql,
      [
        b.booking_id,
        "cash_returned",
        12345,
        "2026-10-02T16:02:00Z",
        "Synthetic",
        id(),
        true,
      ],
      /inspection/,
    );
    await denied(
      "Return odometer cannot decrease",
      inspectionSql,
      [b.booking_id, "return", { ...detail("return"), odometer_km: 99 }, id()],
      /odometer/,
    );
    await inspect(b, "return");
    await denied(
      "Excess deposit return rejected",
      eventSql,
      [
        b.booking_id,
        "cash_returned",
        12346,
        "2026-10-02T16:02:00Z",
        "Synthetic",
        id(),
        true,
      ],
      /exceeds/,
    );
    await denied(
      "Unapproved partial return rejected",
      eventSql,
      [
        b.booking_id,
        "cash_returned",
        100,
        "2026-10-02T16:02:00Z",
        "Synthetic",
        id(),
        true,
      ],
      /Partial/,
    );
    await denied(
      "Outstanding deposit cannot silently complete",
      "select public.admin_transition_booking_with_reason($1,'completed',null)",
      [b.booking_id],
      /deposit return/,
    );
    await event(b, "cash_returned", 12345);
    await complete(b);
    let s = await summary(b);
    ok(
      "Normal rental reconciles liability and cash revenue",
      s.cash_held_centavos === 0 &&
        s.rental_paid_centavos === b.rental_total_centavos,
    );
    ok(
      "Actual return time retained",
      (
        await c.query("select returned_at from public.bookings where id=$1", [
          b.booking_id,
        ])
      ).rows[0].returned_at.toISOString() ===
        detail("return").occurred_at.replace("Z", ".000Z"),
    );
    await denied(
      "Deposit snapshot immutable",
      "update public.booking_deposits set required_centavos=1 where booking_id=$1",
      [b.booking_id],
      /immutable/,
    );
    await denied(
      "Deposit event immutable",
      "delete from public.security_deposit_events where booking_id=$1",
      [b.booking_id],
      /immutable/,
    );
    await denied(
      "Inspection immutable",
      "update public.rental_inspections set fuel_percent=0 where booking_id=$1",
      [b.booking_id],
      /immutable/,
    );
    await configure({ partial_cash_return_allowed: true });
    const partial = await submit();
    await verification(partial);
    await pay(partial);
    await event(partial, "cash_collected", 12345);
    await inspect(partial, "handover");
    await inspect(partial, "return");
    await event(partial, "cash_returned", 100);
    await event(partial, "case_opened");
    await complete(partial);
    s = await summary(partial);
    ok(
      "Completed disputed rental retains liability",
      s.cash_held_centavos === 12245 && s.unresolved,
    );
    await denied(
      "Outstanding liability cannot be written off",
      eventSql,
      [
        partial.booking_id,
        "case_resolved",
        0,
        "2026-10-02T16:02:00Z",
        "Synthetic resolution",
        id(),
        true,
      ],
      /Return the cash/,
    );
    await event(partial, "cash_returned", 12245);
    await event(partial, "case_resolved");
    ok(
      "Case resolution after physical return",
      (await summary(partial)).unresolved === false,
    );
    await configure({
      id_enabled: true,
      id_legal_approved: true,
      id_legal_reference: "Synthetic isolated legal review",
      accepted_document_types: ["Synthetic legally reviewed card"],
    });
    await denied(
      "Unlisted ID rejected",
      "select *,policy_version::text from public.get_booking_quote_v3($1,$2,$3,$4,$5,$6)",
      [
        model,
        "2033-06-10T01:00:00Z",
        "2033-06-11T01:00:00Z",
        [],
        "eligible_id",
        "Unapproved document",
      ],
      /approved|eligible|type|permitted/,
    );
    const doc = await submit("eligible_id", "Synthetic legally reviewed card");
    ok(
      "ID has no invented monetary deposit",
      doc.deposit_required_centavos === 0 &&
        Number(doc.cash_due_at_pickup_centavos) === doc.rental_total_centavos,
    );
    await verification(doc);
    await pay(doc);
    await event(doc, "id_received");
    await inspect(doc, "handover");
    await denied(
      "ID return requires inspection",
      eventSql,
      [
        doc.booking_id,
        "id_returned",
        0,
        "2026-10-02T16:02:00Z",
        "Synthetic",
        id(),
        true,
      ],
      /inspection/,
    );
    await inspect(doc, "return");
    await event(doc, "case_opened");
    await complete(doc);
    ok(
      "Unresolved ID custody remains visible",
      (await summary(doc)).id_in_custody === true,
    );
    await event(doc, "id_returned");
    await event(doc, "case_resolved");
    ok(
      "Physical ID return resolves custody",
      (await summary(doc)).id_in_custody === false,
    );
    await claims(customer);
    await denied(
      "Customer cannot record deposit",
      eventSql,
      [
        doc.booking_id,
        "case_opened",
        0,
        "2026-10-02T16:02:00Z",
        "Synthetic",
        id(),
        true,
      ],
      /Administrator/,
    );
    await claims(admin);
    await c.query(
      "update public.admin_users set is_active=false where auth_user_id=$1",
      [admin],
    );
    await denied(
      "Suspended administrator cannot change policy",
      "select public.admin_save_security_deposit_settings($1)",
      [settings],
      /Administrator/,
    );
    await c.query(
      "update public.admin_users set is_active=true where auth_user_id=$1",
      [admin],
    );
    await c.query("set local role authenticated");
    await claims(outsider);
    await denied(
      "Other customer cannot read summary",
      "select public.get_booking_deposit_summary($1)",
      [b.booking_id],
      /ownership/,
    );
    for (const table of [
      "booking_deposits",
      "security_deposit_events",
      "rental_inspections",
      "security_deposit_settings",
    ])
      ok(
        "Customer RLS hides " + table,
        (await c.query(`select count(*)::int n from public.${table}`)).rows[0]
          .n === 0,
      );
    await denied(
      "Direct ledger mutation forbidden",
      "insert into public.security_deposit_events(booking_id) values($1)",
      [b.booking_id],
      /permission/,
    );
    await c.query("reset role");
    await claims(admin);
    // Expiration fixtures stay inside this rollback-only transaction.
    await configure();
    const pending = await submit();
    const state = (
      await c.query(
        "select status,motorcycle_unit_id,extract(epoch from expires_at-submitted_at)::int seconds from public.bookings where id=$1",
        [pending.booking_id],
      )
    ).rows[0];
    ok(
      "Pending request has 24-hour fixture expiration and no assigned unit",
      state.status === "pending" &&
        state.motorcycle_unit_id === null &&
        state.seconds === 86400,
    );
    const beforeHold = (
      await c.query("select public.check_model_availability($1,$2,$3) n", [
        model,
        "2033-06-10T01:00:00Z",
        "2033-06-11T01:00:00Z",
      ])
    ).rows[0].n;
    await c.query(
      "update public.booking_inventory_holds set created_at=now()-interval '1 hour',expires_at=now()-interval '1 minute' where booking_id=$1",
      [pending.booking_id],
    );
    const afterHold = (
      await c.query("select public.check_model_availability($1,$2,$3) n", [
        model,
        "2033-06-10T01:00:00Z",
        "2033-06-11T01:00:00Z",
      ])
    ).rows[0].n;
    ok(
      "Expired temporary hold releases physical inventory while request remains pending",
      afterHold === beforeHold + 1 &&
        (
          await c.query("select status from public.bookings where id=$1", [
            pending.booking_id,
          ])
        ).rows[0].status === "pending",
    );
    await c.query(
      "update public.bookings set expires_at=now()-interval '1 minute' where id=$1",
      [pending.booking_id],
    );
    await claims(admin);
    await denied(
      "Expired request cannot be confirmed",
      "select public.admin_confirm_booking($1,$2)",
      [pending.booking_id, unit],
      /not active|Expired/,
    );
    await c.query("select public.expire_pending_bookings()");
    ok(
      "Expiry worker expires pending request",
      (
        await c.query("select status from public.bookings where id=$1", [
          pending.booking_id,
        ])
      ).rows[0].status === "expired",
    );
    ok(
      "Expiry worker releases holds",
      (
        await c.query(
          "select count(*)::int n from public.booking_inventory_holds where booking_id=$1 and released_at is null",
          [pending.booking_id],
        )
      ).rows[0].n === 0,
    );
    const cancelled = await submit();
    await verification(cancelled);
    await event(cancelled, "cash_collected", 12345);
    await c.query(
      "select public.admin_transition_booking_with_reason($1,'cancelled','Synthetic cancellation')",
      [cancelled.booking_id],
    );
    ok(
      "Cancellation retains real deposit liability",
      (await summary(cancelled)).cash_held_centavos === 12345,
    );
    await event(cancelled, "cash_returned", 12345);
    ok(
      "Verified cancellation deposit return reconciles",
      (await summary(cancelled)).cash_held_centavos === 0,
    );
    const provenance = (
      await c.query(
        "select bool_and(is_test) ok from public.booking_deposits where booking_id=any($1::uuid[])",
        [[b.booking_id, partial.booking_id, doc.booking_id]],
      )
    ).rows[0];
    ok("Immutable synthetic provenance preserved", provenance.ok === true);
    await c.query("set constraints all immediate");
    ok("Deferred snapshots all present");
    const cron = (
      await c.query(
        "select schedule,command,active from cron.job where jobname='kjm-expire-pending-bookings'",
      )
    ).rows;
    ok(
      "Disposable expiry Cron registered",
      cron.some(
        (j) =>
          j.active &&
          j.schedule === "* * * * *" &&
          j.command.includes("expire_pending_bookings"),
      ),
    );
    ok(
      "Public booking remains disabled",
      (
        await c.query(
          "select public_booking_enabled from public.booking_settings",
        )
      ).rows[0].public_booking_enabled === false,
    );
    await c.query("rollback");
    ok("All schema and synthetic records rolled back");
    console.log(
      JSON.stringify({ project: ref, committed: false, results }, null, 2),
    );
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.error(
      JSON.stringify({ error: e.message, code: e.code, results }, null, 2),
    );
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
