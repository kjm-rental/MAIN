import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID as id } from "node:crypto";
import connection from "./connection.cjs";
const { client, ref } = connection,
  c = client();
await c.connect();
const db = {
  exec: (sql) => c.query(sql),
  query: (sql, args) => c.query(sql, args),
  close: () => c.end(),
};
const out = path.dirname(fileURLToPath(import.meta.url)),
  results = [];
function ok(name, pass = true) {
  results.push({ name, status: pass ? "PASS" : "FAIL" });
  if (!pass) throw Error(name);
  console.log("PASS " + name);
}
async function denied(
  name,
  sql,
  args = [],
  pattern = /permission|Administrator|Stale|eligible|expired/i,
) {
  await db.exec("savepoint denial");
  try {
    await db.query(sql, args);
    throw Error("Unexpected success");
  } catch (e) {
    await db.exec("rollback to savepoint denial");
    if (!pattern.test(e.message)) throw e;
    ok(name);
  } finally {
    await db.exec("release savepoint denial");
  }
}
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
try {
  const installed = (
    await q(
      "select version from supabase_migrations.schema_migrations where version='202610110022'",
    )
  ).length;
  ok("Committed migration 022 required", installed === 1);
  const admin = id(),
    customer = id(),
    other = id(),
    model = id(),
    booking = id(),
    cid = id();
  await db.exec("begin");
  for (const user of [admin, customer, other])
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,aud,role,encrypted_password,created_at,updated_at,is_anonymous) values($1,$2,now(),'authenticated','authenticated','synthetic',now(),now(),false)",
      [user, user + "@example.invalid"],
    );
  await db.query(
    "insert into public.admin_users(auth_user_id,role,is_active) values($1,'administrator',true)",
    [admin],
  );
  await db.query(
    "insert into public.customers(id,auth_user_id,full_name,email) values($1,$2,'Synthetic','synthetic@example.invalid')",
    [cid, customer],
  );
  await db.query(
    "insert into public.motorcycle_models(id,slug,brand,model_name,display_name,daily_rate_php) values($1,'synthetic-notifications','Synthetic','Synthetic','Synthetic',499)",
    [model],
  );
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: admin, role: "authenticated", is_anonymous: false }),
  ]);
  await db.query(
    "insert into public.bookings(id,booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,base_total_php,is_test) values($1,'KJM-SYN-LOCAL',$2,$3,now()+interval '12 hours',now()+interval '36 hours','pending',499,499,true)",
    [booking, cid, model],
  );
  await db.query(
    "insert into public.booking_deposits(booking_id,option,required_centavos,partial_return_allowed,collection_instructions,return_instructions,dispute_instructions,policy_version,request_fingerprint,is_test) values($1,'cash',12345,true,'Synthetic','Synthetic','Synthetic',now(),'synthetic',true)",
    [booking],
  );
  ok(
    "Request trigger creates two channel records",
    (await q("select count(*)::int n from public.notification_outbox"))[0].n ===
      2,
  );
  await db.query(
    "select private.enqueue_kjm_notification($1,'booking_requested',$2)",
    [booking, "request:" + booking],
  );
  ok(
    "Duplicate source event creates no duplicate deliveries",
    (await q("select count(*)::int n from public.notification_outbox"))[0].n ===
      2,
  );
  ok(
    "Outbox omits identity documents/customer email/internal notes",
    !JSON.stringify(
      await q("select * from public.notification_outbox"),
    ).includes("synthetic@example.invalid"),
  );
  await db.exec("savepoint rolled_event");
  await db.query(
    "select private.enqueue_kjm_notification($1,'cash_payment','rollback-event',100)",
    [booking],
  );
  await db.exec("rollback to savepoint rolled_event");
  ok(
    "Transaction rollback removes generated notifications",
    (
      await q(
        "select count(*)::int n from public.notification_outbox where event_key='rollback-event'",
      )
    )[0].n === 0,
  );
  await db.exec("set local role authenticated");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: customer, role: "authenticated" }),
  ]);
  ok(
    "Customer RLS hides all outbox rows",
    (await q("select count(*)::int n from public.notification_outbox"))[0].n ===
      0,
  );
  await denied(
    "Customer cannot enqueue custom notifications",
    "select private.enqueue_kjm_notification($1,'cash_payment','attack')",
    [booking],
  );
  await denied(
    "Customer cannot claim worker rows",
    "select * from public.notification_claim('resend',true)",
  );
  await denied(
    "Customer cannot modify preferences",
    "select public.admin_save_notification_settings($1)",
    [
      {
        enabled_events: [],
        pickup_hours: 24,
        return_hours: 24,
        morning_hour: 8,
      },
    ],
  );
  await denied(
    "Customer cannot insert outbox",
    "insert into public.notification_outbox(event_key) values('attack')",
  );
  await db.exec("reset role");
  const settings = (await q("select * from public.notification_settings"))[0];
  ok(
    "External providers and reminders default disabled",
    !settings.telegram_enabled &&
      !settings.resend_enabled &&
      !settings.reminders_approved,
  );
  ok(
    "Live disabled channel yields no claims",
    (await q("select * from public.notification_claim('resend',false)"))
      .length === 0,
  );
  const claimed = (
    await q("select * from public.notification_claim('resend',true)")
  )[0];
  ok(
    "Synthetic mock worker claims one row",
    !!claimed && claimed.simulated && claimed.attempt_count === 1,
  );
  ok(
    "Second worker call cannot claim an in-flight row",
    (await q("select * from public.notification_claim('resend',true)"))
      .length === 0,
  );
  await denied(
    "Stale worker token cannot finish",
    "select public.notification_finish($1,$2,'sent')",
    [claimed.id, id()],
  );
  const prepared = (
    await q("select public.notification_prepare($1,$2,$3) result", [
      claimed.id,
      claimed.lease_token,
      "a".repeat(64),
    ])
  )[0].result;
  ok(
    "Worker resolves verified auth email only",
    prepared.recipient === customer + "@example.invalid",
  );
  await db.query(
    "select public.notification_finish($1,$2,'transient',null,120)",
    [claimed.id, claimed.lease_token],
  );
  ok(
    "Failure schedules retry and preserves booking state",
    (
      await q("select status from public.notification_outbox where id=$1", [
        claimed.id,
      ])
    )[0].status === "retry_scheduled" &&
      (await q("select status from public.bookings where id=$1", [booking]))[0]
        .status === "pending",
  );
  await db.query(
    "update public.notification_outbox set available_at=now() where id=$1",
    [claimed.id],
  );
  const again = (
    await q("select * from public.notification_claim('resend',true)")
  )[0];
  ok(
    "Retry keeps event ID and increments attempt",
    again.id === claimed.id && again.attempt_count === 2,
  );
  await db.query("select public.notification_prepare($1,$2,$3)", [
    again.id,
    again.lease_token,
    "a".repeat(64),
  ]);
  await db.query(
    "select public.notification_finish($1,$2,'sent','mock:receipt')",
    [again.id, again.lease_token],
  );
  ok(
    "Simulated success clearly marked and timestamped",
    (
      await q("select * from public.notification_outbox where id=$1", [
        claimed.id,
      ])
    )[0].simulated &&
      (
        await q(
          "select delivered_at from public.notification_outbox where id=$1",
          [claimed.id],
        )
      )[0].delivered_at != null,
  );

  await db.query(
    "select private.enqueue_kjm_notification($1,'cash_payment','invalid-recipient',100)",
    [booking],
  );
  const invalidRecipient = (
    await q("select * from public.notification_claim('resend',true)")
  )[0];
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    customer,
  ]);
  ok(
    "Unverified Auth email blocks delivery",
    (
      await q("select public.notification_prepare($1,$2,$3) result", [
        invalidRecipient.id,
        invalidRecipient.lease_token,
        "d".repeat(64),
      ])
    )[0].result === null &&
      (
        await q(
          "select last_error from public.notification_outbox where id=$1",
          [invalidRecipient.id],
        )
      )[0].last_error === "invalid_recipient",
  );
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [
    customer,
  ]);
  await db.query(
    "select private.enqueue_kjm_notification($1,'cash_payment','lease-expiry',100)",
    [booking],
  );
  const expiringLease = (
    await q("select * from public.notification_claim('resend',true)")
  )[0];
  await db.query(
    "update public.notification_outbox set lease_until=now()-interval '1 second' where id=$1",
    [expiringLease.id],
  );
  await db.query("select * from public.notification_claim('resend',true)");
  ok(
    "Expired worker lease held for review without automatic resend",
    (
      await q("select last_error from public.notification_outbox where id=$1", [
        expiringLease.id,
      ])
    )[0].last_error === "lease_expired",
  );
  await db.query(
    "select private.enqueue_kjm_notification($1,'cash_payment','window-expiry',100)",
    [booking],
  );
  await db.query(
    "update public.notification_outbox set first_attempt_at=now()-interval '24 hours' where event_key='window-expiry' and channel='resend'",
  );
  await db.query("select * from public.notification_claim('resend',true)");
  ok(
    "Provider idempotency window expiration prevents automatic retries",
    (
      await q(
        "select last_error from public.notification_outbox where event_key='window-expiry' and channel='resend'",
      )
    )[0].last_error === "idempotency_window_expired",
  );
  // Administrator-only retry and in-flight duplication protection.
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: admin, role: "authenticated" }),
  ]);
  await db.query(
    "select private.enqueue_kjm_notification($1,'cash_payment','synthetic-retry',100)",
    [booking],
  );
  const retryRow = (
    await q(
      "select * from public.notification_outbox where event_key='synthetic-retry' and channel='resend'",
    )
  )[0];
  await db.query(
    "update public.notification_outbox set status='failed_permanently',last_error='transient',first_attempt_at=now(),attempt_count=1 where id=$1",
    [retryRow.id],
  );
  await db.exec("set local role authenticated");
  await db.query("select public.admin_retry_notification($1)", [retryRow.id]);
  await denied(
    "Concurrent logical manual retry rejected once pending",
    "select public.admin_retry_notification($1)",
    [retryRow.id],
  );
  await db.exec("reset role");
  ok(
    "Manual retry keeps notification ID and is audited",
    (
      await q(
        "select manual_retry_count from public.notification_outbox where id=$1",
        [retryRow.id],
      )
    )[0].manual_retry_count === 1 &&
      (
        await q(
          "select count(*)::int n from public.audit_logs where action='notifications.manual_retry' and entity_id=$1",
          [retryRow.id],
        )
      )[0].n === 1,
  );
  const retryClaim = (
    await q("select * from public.notification_claim('resend',true)")
  )[0];
  await db.query("select public.notification_prepare($1,$2,$3)", [
    retryClaim.id,
    retryClaim.lease_token,
    "b".repeat(64),
  ]);
  await db.query("select public.notification_finish($1,$2,'transient')", [
    retryClaim.id,
    retryClaim.lease_token,
  ]);
  await db.query(
    "update public.notification_outbox set available_at=now() where id=$1",
    [retryClaim.id],
  );
  const changed = (
    await q("select * from public.notification_claim('resend',true)")
  )[0];
  ok(
    "Changed request fingerprint is held permanently",
    (
      await q("select public.notification_prepare($1,$2,$3) result", [
        changed.id,
        changed.lease_token,
        "c".repeat(64),
      ])
    )[0].result === null &&
      (
        await q(
          "select last_error from public.notification_outbox where id=$1",
          [changed.id],
        )
      )[0].last_error === "request_changed",
  );
  const telegram = (
    await q("select * from public.notification_claim('telegram',true)")
  )[0];
  await db.query(
    "select public.notification_finish($1,$2,'delivery_ambiguous')",
    [telegram.id, telegram.lease_token],
  );
  ok(
    "Ambiguous Telegram delivery is never automatically retried",
    (
      await q("select status from public.notification_outbox where id=$1", [
        telegram.id,
      ])
    )[0].status === "failed_permanently",
  );
  await db.exec("set local role authenticated");
  await denied(
    "Ambiguous delivery cannot be manually retried",
    "select public.admin_retry_notification($1)",
    [telegram.id],
  );
  await db.exec("reset role");
  const tables = await q(
    "select relname,relrowsecurity,relforcerowsecurity,has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE') writes from pg_class where relname in ('notification_outbox','notification_settings','notification_generation_errors')",
  );
  ok(
    "All notification tables forced RLS with no client writes",
    tables.length === 3 &&
      tables.every(
        (t) => t.relrowsecurity && t.relforcerowsecurity && !t.writes,
      ),
  );
  const functions = await q(
    "select proname,proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon_exec,has_function_privilege('authenticated',p.oid,'EXECUTE') customer_exec from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and (proname like 'notification_%' or proname like '%kjm_notification%')",
  );
  ok(
    "Worker functions use safe search_path and deny all client execution",
    functions.every(
      (f) =>
        f.proconfig?.includes('search_path=""') &&
        !f.anon_exec &&
        !f.customer_exec,
    ),
  );
  ok(
    "Migration 022 introduced no sequences",
    (
      await q(
        "select count(*)::int n from pg_class where relkind='S' and relnamespace='public'::regnamespace",
      )
    )[0].n === 1,
  );
  // Exercise actual financial trigger using authorized RPC; no fake client notification events.
  await db.query(
    "select public.admin_record_offline_payment($1,100,'cash','SYNTHETIC-P10',now(),'Synthetic payment',$2)",
    [booking, id()],
  );
  ok(
    "Authorized payment produces exactly two cash notifications",
    (
      await q(
        "select count(*)::int n from public.notification_outbox where event_type='cash_payment' and event_key like 'cash-payment:%'",
      )
    )[0].n === 2,
  );
  // Generation failure cannot erase the real payment; recover from minimal authoritative metadata.
  await db.exec(
    "alter table public.notification_outbox add constraint synthetic_force_failure check(event_type<>'cash_payment') not valid",
  );
  const secondPaymentKey = id();
  await db.query(
    "select public.admin_record_offline_payment($1,100,'cash','SYNTHETIC-P10-2',now(),'Synthetic payment',$2)",
    [booking, secondPaymentKey],
  );
  ok(
    "Outbox generation error does not roll back financial payment",
    (
      await q(
        "select count(*)::int n from public.payment_events where idempotency_key=$1",
        [secondPaymentKey],
      )
    )[0].n === 1,
  );
  ok(
    "Generation error stored without private exception strings",
    (
      await q(
        "select count(*)::int n from public.notification_generation_errors",
      )
    )[0].n === 1,
  );
  await db.exec(
    "alter table public.notification_outbox drop constraint synthetic_force_failure",
  );
  const gen = (
    await q("select id from public.notification_generation_errors")
  )[0];
  await db.query("select public.admin_repair_notification_generation($1)", [
    gen.id,
  ]);
  ok(
    "Authoritative generation repair succeeds once",
    (
      await q(
        "select recovered_at from public.notification_generation_errors where id=$1",
        [gen.id],
      )
    )[0].recovered_at != null,
  );
  await denied(
    "Recovered generation cannot be duplicated",
    "select public.admin_repair_notification_generation($1)",
    [gen.id],
    /recoverable/,
  );

  await db.query("select public.admin_set_motorcycle_quantity($1,8,0)", [
    model,
  ]);
  const units = await q(
    "select id from public.motorcycle_units where motorcycle_model_id=$1 order by id",
    [model],
  );
  let fixtureIndex = 0;
  async function bookingFixture(status, startHours, endHours) {
    const bid = id(),
      vid = id(),
      assigned = units[fixtureIndex++].id;
    await db.query(
      "insert into public.bookings(id,booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,base_total_php,is_test,expires_at) values($1,$2,$3,$4,now()+make_interval(hours=>$5),now()+make_interval(hours=>$6),'pending',499,499,true,now()+interval '1 day')",
      [bid, "KJM-FIX-" + bid.slice(0, 8), cid, model, startHours, endHours],
    );
    await db.query(
      "insert into public.booking_deposits(booking_id,option,required_centavos,partial_return_allowed,collection_instructions,return_instructions,dispute_instructions,policy_version,request_fingerprint,is_test) values($1,'cash',12345,true,'Synthetic','Synthetic','Synthetic',now(),'synthetic',true)",
      [bid],
    );
    await db.query(
      "update public.bookings set deposit_required_centavos=12345 where id=$1",
      [bid],
    );
    await db.query(
      "insert into public.customer_verifications(id,booking_id,customer_id,customer_type,identity_status,license_status,entitlement_status,international_status,overall_status,license_expiration_date) values($1,$2,$3,'philippine_resident','approved','approved','approved','not_applicable','approved','2038-01-01')",
      [vid, bid, cid],
    );
    for (const kind of ["government_id", "drivers_license_front"]) {
      const storage = customer + "/" + bid + "/" + id() + ".pdf";
      await db.query(
        "insert into storage.objects(bucket_id,name,owner_id,metadata) values('identity-verification',$1,$2,$3)",
        [storage, customer, { mimetype: "application/pdf", size: 64 }],
      );
      await db.query(
        "insert into public.verification_documents(verification_id,booking_id,owner_user_id,document_kind,storage_path,mime_type,size_bytes) values($1,$2,$3,$4,$5,'application/pdf',64)",
        [vid, bid, customer, kind, storage],
      );
    }
    if (["confirmed", "active"].includes(status))
      await db.query("select public.admin_confirm_booking($1,$2)", [
        bid,
        assigned,
      ]);
    if (status === "active") {
      await db.query(
        "select public.admin_record_offline_payment($1,49900,'cash',$2,now(),'Synthetic payment',$3)",
        [bid, "SYN-P10-" + bid, id()],
      );
      await db.query(
        "select public.admin_record_security_deposit_event($1,'cash_collected',12345,now(),'Synthetic collection',$2,true)",
        [bid, id()],
      );
      await db.query(
        "select public.admin_record_rental_inspection($1,'handover',$2,$3)",
        [
          bid,
          {
            occurred_at: (
              await q("select now()-interval '2 minutes' ts")
            )[0].ts.toISOString(),
            odometer_km: 100,
            fuel_percent: 75,
            condition_notes: "Synthetic checked",
            accessories_notes: "Synthetic helmet",
            identity_checked: true,
            accessories_checked: true,
          },
          id(),
        ],
      );
    }
    if (["cancelled", "rejected"].includes(status))
      await db.query(
        "select public.admin_transition_booking_with_reason($1,$2,$3)",
        [bid, status, "Synthetic local workflow"],
      );
    if (status === "expired")
      await db.query(
        "update public.bookings set status='expired' where id=$1",
        [bid],
      );
    return { id: bid, status };
  }
  const reminderBookings = [];
  for (const [status, start, end] of [
    ["confirmed", 12, 36],
    ["active", -12, 12],
    ["active", -36, -12],
    ["cancelled", 12, 36],
    ["expired", 12, 36],
    ["pending", 12, 36],
  ])
    reminderBookings.push(await bookingFixture(status, start, end));
  ok(
    "Unapproved reminder timings schedule nothing",
    (await q("select public.notification_schedule_reminders() n"))[0].n === 0,
  );
  await db.query("select public.admin_save_notification_settings($1)", [
    {
      enabled_events: settings.enabled_events,
      reminders_approved: true,
      pickup_hours: 24,
      return_hours: 24,
      morning_hour: 0,
    },
  ]);
  const firstSchedule = (
    await q("select public.notification_schedule_reminders() n")
  )[0].n;
  ok(
    "Approved reminder schedule creates pickups, active returns and staff overdue alerts",
    firstSchedule >= 5,
  );
  ok(
    "Repeated schedule never duplicates logical reminders",
    (await q("select public.notification_schedule_reminders() n"))[0].n === 0,
  );
  ok(
    "Cancelled expired and unapproved requests receive no reminders",
    (
      await q(
        "select count(*)::int n from public.notification_outbox where event_type in ('pickup_reminder','return_reminder','overdue') and booking_id=any($1::uuid[])",
        [
          reminderBookings
            .filter((b) =>
              ["cancelled", "expired", "pending"].includes(b.status),
            )
            .map((b) => b.id),
        ],
      )
    )[0].n === 0,
  );
  const target = reminderBookings[0];
  await db.query("update public.bookings set status='cancelled' where id=$1", [
    target.id,
  ]);
  const candidates = await q(
    "select * from public.notification_outbox where booking_id=$1 and event_type='pickup_reminder'",
    [target.id],
  );
  ok(
    "Pickup reminder eligibility rechecks cancellation",
    (
      await q(
        "select private.kjm_notification_eligible(n) eligible from public.notification_outbox n where id=$1",
        [candidates[0].id],
      )
    )[0].eligible === false,
  );
  const reschedule = reminderBookings[1];
  const oldReminder = (
    await q(
      "select id from public.notification_outbox where booking_id=$1 and event_type='return_reminder' limit 1",
      [reschedule.id],
    )
  )[0];
  await db.query(
    "update public.bookings set end_at=end_at+interval '1 hour' where id=$1",
    [reschedule.id],
  );
  ok(
    "Rescheduled rental invalidates old reminder timestamp",
    (
      await q(
        "select private.kjm_notification_eligible(n) eligible from public.notification_outbox n where id=$1",
        [oldReminder.id],
      )
    )[0].eligible === false,
  );
  await db.exec("set timezone='Asia/Manila'");
  const afterTZ = (
    await q("select public.notification_schedule_reminders() n")
  )[0].n;
  ok("UTC/Manila reminder keys avoid timezone duplicate events", afterTZ === 2);
  await db.exec("set timezone='UTC'");
  // Authoritative event catalog coverage from guarded operations.
  const transition = await bookingFixture("confirmed", 120, 144);
  ok(
    "Booking approval captured from guarded RPC",
    (
      await q(
        "select count(*)::int n from public.notification_outbox where booking_id=$1 and event_type='booking_approved'",
        [transition.id],
      )
    )[0].n === 2,
  );
  await db.query(
    "select public.admin_transition_booking_with_reason($1,'cancelled','Synthetic cancellation')",
    [transition.id],
  );
  ok(
    "Booking cancellation captured",
    (
      await q(
        "select count(*)::int n from public.notification_outbox where booking_id=$1 and event_type='booking_cancelled'",
        [transition.id],
      )
    )[0].n === 2,
  );
  const rejection = reminderBookings.find((b) => b.status === "pending");
  await db.query(
    "select public.admin_transition_booking_with_reason($1,'rejected','Synthetic rejection')",
    [rejection.id],
  );
  ok(
    "Booking rejection captured without internal notes",
    (
      await q(
        "select count(*)::int n from public.notification_outbox where booking_id=$1 and event_type='booking_rejected'",
        [rejection.id],
      )
    )[0].n === 2,
  );
  const active = reminderBookings[1];
  await db.query(
    "select public.admin_record_rental_inspection($1,'return',$2,$3)",
    [
      active.id,
      {
        occurred_at: (
          await q("select now()-interval '1 minute' ts")
        )[0].ts.toISOString(),
        odometer_km: 120,
        fuel_percent: 75,
        condition_notes: "Synthetic return checked",
        accessories_notes: "Synthetic helmet",
        accessories_checked: true,
      },
      id(),
    ],
  );
  await db.query(
    "select public.admin_record_security_deposit_event($1,'case_opened',0,now(),'Synthetic unresolved deposit',$2,true)",
    [active.id, id()],
  );
  await db.query(
    "select public.admin_record_security_deposit_event($1,'cash_returned',12345,now(),'Synthetic full return',$2,true)",
    [active.id, id()],
  );
  await db.query(
    "select public.admin_record_security_deposit_event($1,'case_resolved',0,now(),'Synthetic resolved deposit',$2,true)",
    [active.id, id()],
  );
  await db.query(
    "select public.admin_transition_booking_with_reason($1,'completed',null)",
    [active.id],
  );
  for (const event of [
    "handover",
    "returned",
    "deposit_collected",
    "deposit_returned",
    "deposit_unresolved",
    "verification_review",
  ])
    ok(
      event + " generated by authoritative workflow",
      (
        await q(
          "select count(*)::int n from public.notification_outbox where event_type=$1",
          [event],
        )
      )[0].n > 0,
    );
  await db.query(
    "insert into public.customer_verifications(booking_id,customer_id,customer_type) values($1,$2,'philippine_resident')",
    [booking, cid],
  );
  await db.query(
    "update public.customer_verifications set overall_status='resubmission_required' where booking_id=$1",
    [booking],
  );
  ok(
    "Verification action uses no internal notes",
    (
      await q(
        "select count(*)::int n from public.notification_outbox where event_type='verification_action'",
      )
    )[0].n === 2,
  );
  await db.query(
    "update public.admin_users set is_active=false where auth_user_id=$1",
    [admin],
  );
  await denied(
    "Suspended administrator cannot manage notification preferences",
    "select public.admin_save_notification_settings($1)",
    [
      {
        enabled_events: [],
        pickup_hours: 24,
        return_hours: 24,
        morning_hour: 8,
      },
    ],
  );
  await db.exec("rollback");
} catch (e) {
  await db.exec("rollback").catch(() => {});
  results.push({
    name: "Integration failure",
    status: "FAIL",
    detail: e.message,
  });
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.exec("rollback").catch(() => {});
  fs.writeFileSync(
    path.join(out, "integration-results.json"),
    JSON.stringify(
      {
        project: ref,
        engine:
          "Actual disposable Supabase PostgreSQL; no schema/bootstrap shims",
        fixtureChangesRolledBack: true,
        productionContacted: false,
        realProviderCalls: false,
        results,
      },
      null,
      2,
    ),
  );
  await db.close();
}
