/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");
const { randomUUID } = require("node:crypto");

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required");
const results = [];
const ids = { admin: randomUUID(), a: randomUUID(), b: randomUUID() };
const tag = ids.admin.slice(0,6);
const hours = Object.fromEntries(["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].map((d) => [d,{enabled:true,pickupOpen:"08:00",pickupClose:"00:00",returnOpen:"08:00",returnClose:"00:00"}]));
const start = "2030-06-10T01:00:00Z", end = "2030-06-11T01:00:00Z";
const laterStart = "2030-06-20T01:00:00Z", laterEnd = "2030-06-21T01:00:00Z";

async function client() { const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false} }); await c.connect(); return c; }
async function claims(c,user,role="authenticated") { await c.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,role,is_anonymous:false})]); }
function record(name, ok, detail="") { results.push({name,status:ok?"PASS":"FAIL",detail}); if(!ok) throw new Error(`${name}: ${detail}`); }
async function expectFailure(name, fn, pattern) { try { await fn(); record(name,false,"unexpected success"); } catch(e) { record(name,pattern.test(e.message),e.message); } }
async function submit(c,user,key,extraId,s=start,e=end) {
  await claims(c,user);
  return c.query("select * from public.submit_booking_request_v2($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)",
    [key,global.model,s,e,JSON.stringify([{id:extraId,quantity:1}]),`Synthetic ${user.slice(0,5)}`,`${user}@example.invalid`,`+639000000000`,`PH`,`philippine_resident`,`Synthetic Identity`,`Synthetic License`,`PH`,`2035-01-01`,`A`,null,true,true]);
}
async function adminCall(c, sql, params) { await claims(c,ids.admin); return c.query(sql,params); }

(async()=>{
  const c=await client();
  try {
    await c.query("begin");
    for (const [id,email] of [[ids.admin,`admin-${ids.admin}@example.invalid`],[ids.a,`a-${ids.a}@example.invalid`],[ids.b,`b-${ids.b}@example.invalid`]])
      await c.query("insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at,is_anonymous) values($1,'authenticated','authenticated',$2,'synthetic',now(),now(),false)",[id,email]);
    await c.query("insert into public.admin_users(auth_user_id,role,is_active) values($1,'administrator',true)",[ids.admin]);
    for (const id of [ids.a,ids.b]) await c.query("insert into public.booking_test_authorizations(auth_user_id,authorized_by,expires_at) values($1,$2,now()+interval '1 day')",[id,ids.admin]);
    await c.query("update public.booking_settings set operating_hours=$1,partial_day_policy='started_24_hours',partial_day_pricing_policy='charge_full_day',pending_hold_minutes=30,pending_expiration_minutes=60,accepted_philippine_id_types='[\"passport\"]',philippine_license_policy='Synthetic approved policy',international_license_policy='Synthetic approved policy',international_policy_source_url='https://example.invalid/policy',international_policy_verified_at=current_date,privacy_notice='Synthetic notice',retention_policy='Synthetic retention',policies_approved_at=now(),policies_approved_by=$2 where id=true",[hours,ids.admin]);
    const model=(await c.query("update public.motorcycle_models set is_published=true where id=(select id from public.motorcycle_models order by slug limit 1) returning id")).rows[0].id; global.model=model;
    global.units=[]; for(let i=1;i<=5;i++) global.units.push((await c.query("insert into public.motorcycle_units(motorcycle_model_id,internal_unit_code,status) values($1,$2,'available') returning id",[model,`SYN-${ids.a.slice(0,5)}-${i}`])).rows[0].id);
    global.helmet=(await c.query("insert into public.booking_extras_catalog(name,description,price_php,is_available,is_active,pricing_model,total_quantity,max_per_booking) values($1,'Integration fixture',100,true,true,'per_rental',1,1) returning id",[`Synthetic Helmet ${ids.a.slice(0,5)}`])).rows[0].id;
    global.perDay=(await c.query("insert into public.booking_extras_catalog(name,description,price_php,is_available,is_active,pricing_model,total_quantity,max_per_booking) values($1,'Integration fixture',50,true,true,'per_day',5,2) returning id",[`Synthetic Raincoat ${ids.a.slice(0,5)}`])).rows[0].id;
    await c.query("commit"); record("migrations and synthetic fixture setup",true);
  } finally { await c.end(); }

  const ca=await client(), cb=await client();
  const concurrent=await Promise.allSettled([submit(ca,ids.a,randomUUID(),global.helmet),submit(cb,ids.b,randomUUID(),global.helmet)]);
  record("concurrent last-item booking",concurrent.filter(x=>x.status==="fulfilled").length===1 && concurrent.filter(x=>x.status==="rejected").length===1,concurrent.map(x=>x.status==="rejected"?x.reason.message:"committed").join(" | "));
  await ca.end(); await cb.end();

  const q=await client();
  const winner=(await q.query("select b.id,b.motorcycle_unit_id from public.bookings b join public.booking_extra_items i on i.booking_id=b.id where i.extra_id=$1 limit 1",[global.helmet])).rows[0];
  const otherCustomer=(await q.query("insert into public.customers(full_name,email,is_test) values('Synthetic Reserved',$1,true) returning id",[`reserved-${tag}@example.invalid`])).rows[0].id;
  const reserved=(await q.query("insert into public.bookings(booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,base_total_php,extras_total_php,pricing_units,is_test) values($1,$2,$3,$4,$5,'confirmed',100,0,100,1,true) returning id",[`SYN-${randomUUID()}`,otherCustomer,global.model,laterStart,laterEnd])).rows[0].id;
  await q.query("insert into public.booking_extra_items(booking_id,extra_id,name_snapshot,price_php_snapshot,quantity,pricing_model_snapshot,charged_units,line_total_centavos) values($1,$2,'Synthetic Helmet',100,1,'per_rental',1,10000)",[reserved,global.helmet]);
  await q.query("update public.bookings set status='confirmed',motorcycle_unit_id=$1 where id=$2",[global.units[0],winner.id]);
  await expectFailure("reschedule into reserved extras",()=>adminCall(q,"select public.admin_reschedule_booking($1,$2,$3,null)",[winner.id,laterStart,laterEnd]),/Insufficient extras inventory/);

  const per=(await submit(q,ids.a,randomUUID(),global.perDay,"2030-07-01T01:00:00Z","2030-07-03T01:00:00Z")).rows[0];
  let line=(await q.query("select * from public.booking_extra_items where booking_id=$1",[per.booking_id])).rows[0];
  record("per-day initial price",line.charged_units===2 && line.line_total_centavos===10000,JSON.stringify(line));
  await q.query("update public.bookings set status='confirmed',motorcycle_unit_id=$1 where id=$2",[global.units[1],per.booking_id]);
  await adminCall(q,"select public.admin_reschedule_booking($1,$2,$3,null)",[per.booking_id,"2030-07-01T01:00:00Z","2030-07-04T01:00:00Z"]);
  line=(await q.query("select * from public.booking_extra_items where booking_id=$1",[per.booking_id])).rows[0];
  record("per-day reschedule repricing",line.charged_units===3 && line.line_total_centavos===15000,JSON.stringify(line));

  const raceExtra=(await q.query("insert into public.booking_extras_catalog(name,description,price_php,is_available,is_active,pricing_model,total_quantity,max_per_booking) values($1,'Concurrency fixture',25,true,true,'per_rental',1,1) returning id",[`Synthetic Race Extra ${ids.b.slice(0,5)}`])).rows[0].id;
  const raceOwner=(await submit(q,ids.a,randomUUID(),raceExtra,"2030-08-01T01:00:00Z","2030-08-02T01:00:00Z")).rows[0];
  await q.query("update public.bookings set status='confirmed',motorcycle_unit_id=$1 where id=$2",[global.units[2],raceOwner.booking_id]);
  const rc1=await client(),rc2=await client();
  const race=await Promise.allSettled([
    adminCall(rc1,"select public.admin_reschedule_booking($1,$2,$3,null)",[raceOwner.booking_id,"2030-08-10T01:00:00Z","2030-08-11T01:00:00Z"]),
    submit(rc2,ids.b,randomUUID(),raceExtra,"2030-08-10T01:00:00Z","2030-08-11T01:00:00Z"),
  ]);
  record("concurrent reschedule versus submission",race.filter(x=>x.status==="fulfilled").length===1 && race.filter(x=>x.status==="rejected").length===1,race.map(x=>x.status==="rejected"?x.reason.message:"committed").join(" | "));
  await rc1.end();await rc2.end();

  const payKey=randomUUID(); const payArgs=[per.booking_id,10000,"cash",`SYN-PAY-1-${tag}`,"2030-01-01T00:00:00Z","Synthetic payment",payKey];
  const paySql="select public.admin_record_offline_payment($1,$2,$3,$4,$5,$6,$7) id";
  const first=(await adminCall(q,paySql,payArgs)).rows[0].id, retry=(await adminCall(q,paySql,payArgs)).rows[0].id;
  record("identical payment retry",first===retry);
  await expectFailure("mismatched idempotency reuse",()=>adminCall(q,paySql,[...payArgs.slice(0,1),9000,...payArgs.slice(2)]),/reused with different/);
  const pc1=await client(),pc2=await client(), concurrentKey=randomUUID(), concurrentArgs=[per.booking_id,5000,"cash",`SYN-PAY-2-${tag}`,"2030-01-02T00:00:00Z","Concurrent",concurrentKey];
  const pays=await Promise.all([adminCall(pc1,paySql,concurrentArgs),adminCall(pc2,paySql,concurrentArgs)]);
  record("concurrent payment retry",pays[0].rows[0].id===pays[1].rows[0].id); await pc1.end();await pc2.end();
  const original=(await q.query("select id from public.payment_events where payment_intent_id=$1",[first])).rows[0].id;
  const adjustSql="select public.admin_record_payment_adjustment($1,$2,$3,$4,$5,$6,$7,$8) id";
  const refundKey=randomUUID(), refundArgs=[original,"refund",3000,"cash",`SYN-REF-1-${tag}`,"2030-01-03T00:00:00Z","Synthetic partial refund",refundKey];
  const refund=(await adminCall(q,adjustSql,refundArgs)).rows[0].id,refundRetry=(await adminCall(q,adjustSql,refundArgs)).rows[0].id;
  record("refund identical retry",refund===refundRetry);
  await expectFailure("refund limit",()=>adminCall(q,adjustSql,[original,"refund",8000,"cash",`SYN-REF-2-${tag}`,"2030-01-04T00:00:00Z","Excess synthetic refund",randomUUID()]),/exceeds remaining/);
  await expectFailure("reversal after partial refund",()=>adminCall(q,adjustSql,[original,"reversal",7000,"cash",`SYN-REV-1-${tag}`,"2030-01-04T00:00:00Z","Invalid payment correction",randomUUID()]),/full, previously unadjusted/);
  const original2=(await q.query("select id from public.payment_events where transaction_reference=$1",[`SYN-PAY-2-${tag}`])).rows[0].id;
  await adminCall(q,adjustSql,[original2,"reversal",5000,"cash",`SYN-REV-2-${tag}`,"2030-01-05T00:00:00Z","Invalid duplicate receipt",randomUUID()]);
  await expectFailure("duplicate reversal",()=>adminCall(q,adjustSql,[original2,"reversal",5000,"cash",`SYN-REV-3-${tag}`,"2030-01-05T00:00:00Z","Repeated invalid correction",randomUUID()]),/(previously unadjusted|remaining refundable)/);
  await expectFailure("invalid completed status transition",()=>q.query("update public.payment_intents set status='failed' where id=$1",[first]),/Invalid payment intent status transition/);
  await expectFailure("immutable financial event update",()=>q.query("update public.payment_events set amount_centavos=1 where id=$1",[original]),/immutable/);
  await expectFailure("immutable financial event delete",()=>q.query("delete from public.payment_events where id=$1",[original]),/immutable/);
  const provenance=await q.query("select bool_and(is_test) ok from (select is_test from public.payment_intents union all select is_test from public.payment_attempts union all select is_test from public.payment_events) x");
  record("immutable synthetic provenance",provenance.rows[0].ok===true);
  const ledger=await q.query("select sum(case when event_type='payment' then amount_centavos else -amount_centavos end)::int net from public.payment_events where booking_id=$1",[per.booking_id]);
  record("financial ledger reconciliation",ledger.rows[0].net===7000,`net=${ledger.rows[0].net}`);
  await claims(q,ids.a);
  await expectFailure("administrator-only financial action",()=>q.query(paySql,[per.booking_id,100,"cash",`SYN-DENIED-${tag}`,"2030-01-06T00:00:00Z","Denied",randomUUID()]),/Administrator access required/);
  await q.query("begin"); await q.query("set local role authenticated"); await claims(q,ids.b);
  const hidden=await q.query("select count(*)::int n from public.payment_events");
  record("ordinary customer financial RLS",hidden.rows[0].n===0,`visible=${hidden.rows[0].n}`); await q.query("rollback");
  const verification=(await q.query("select id from public.customer_verifications where booking_id=$1",[per.booking_id])).rows[0].id;
  const path=`${ids.a}/${per.booking_id}/${randomUUID()}.pdf`;
  await q.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('identity-verification',$1,$2,$3)",[path,ids.a,{mimetype:"application/pdf",size:64}]);
  await claims(q,ids.a);
  await q.query("insert into public.verification_documents(verification_id,booking_id,owner_user_id,document_kind,storage_path,mime_type,size_bytes) values($1,$2,$3,'government_id',$4,'application/pdf',64)",[verification,per.booking_id,ids.a,path]);
  await q.query("begin");await q.query("set local role authenticated");await claims(q,ids.b);
  const hiddenDocs=await q.query("select count(*)::int n from public.verification_documents where booking_id=$1",[per.booking_id]);
  record("cross-customer document RLS",hiddenDocs.rows[0].n===0,`visible=${hiddenDocs.rows[0].n}`);await q.query("rollback");
  await q.end();
  console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(JSON.stringify({fatal:e.message,results},null,2));process.exit(1)});
