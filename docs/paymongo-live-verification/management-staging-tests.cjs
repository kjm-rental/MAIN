/* eslint-disable @typescript-eslint/no-require-imports -- Isolated staging SQL integration harness. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const root = path.resolve(__dirname, "../..");
const cli = path.join(root, "node_modules/.bin/supabase");
const STAGING = "uuxjymzrtncrnnkvdpjy";
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "kjm-staging-payment-"));
const report = { project: STAGING, productionWrites: false, realProviderContacted: false, results: [], bookings: [] };
const quote = v => "'" + String(v).replaceAll("'", "''") + "'";
const uid = () => randomUUID();
async function query(sql) {
  const file = path.join(folder, `${uid()}.sql`);
  fs.writeFileSync(file, sql, { mode: 0o600 });
  try {
    return await new Promise((resolve, reject) => {
      execFile(cli, ["db", "query", "--linked", "--project-ref", STAGING, "--file", file, "--output", "json"],
        { cwd: root, timeout: 90000, maxBuffer: 2e6 }, (error, stdout, stderr) => {
          if (error) return reject(new Error(stderr.slice(-1400)));
          try { resolve(JSON.parse(stdout).rows); } catch { reject(new Error("Invalid CLI query result")); }
        });
    });
  } finally { fs.unlinkSync(file); }
}
function ok(name, condition) {
  if (!condition) throw Error(name);
  report.results.push({ name, passed: true });
  console.log(`PASS: ${name}`);
}
async function race(sqls) {
  const run = async (sql, hold = false) => {
    try { return { success: true, rows: await query(`begin;set local statement_timeout='40s';${hold ? `with result as materialized (${sql}) select result.*,pg_sleep(20) from result` : sql};commit;`) }; }
    catch (error) { return { success: false, error: error.message }; }
  };
  // CLI login-role initialization can race before SQL is sent. Establish the
  // first connection, hold its real database locks, then start the competitor.
  const first = run(sqls[0],true);
  await new Promise(resolve=>setTimeout(resolve,10000));
  const results = await Promise.all([first,...sqls.slice(1).map(sql=>run(sql))]);
  report.races ??= [];
  report.races.push(results);
  return results;
}
async function denied(name, sql) {
  // Expected failures are caught inside a rollback-only block; unrelated SQL failures propagate.
  const escaped = sql.replaceAll("$probe$", "");
  const rows = await query(`begin;create temporary table kjm_denied_result(denied boolean);do $outer$ begin begin execute $probe$${escaped}$probe$; insert into kjm_denied_result values(false); exception when raise_exception or check_violation or unique_violation then insert into kjm_denied_result values(true);end;end $outer$;select denied from kjm_denied_result;rollback;`);
  ok(name, rows[0]?.denied === true);
}
async function main() {
  const [base] = await query(`select (select count(*) from public.customers c join auth.users a on a.id=c.auth_user_id where c.is_test and a.email like '%@example.invalid') as synthetic_count, to_regprocedure('public.prepare_paymongo_guest_checkout(uuid,text,uuid)')::text as guest_rpc;`);
  ok("Pinned staging has synthetic fixtures and guest payment RPC", base.synthetic_count > 0 && !!base.guest_rpc);
  const [fixture] = await query(`select c.id customer_id,c.auth_user_id owner,m.id model_id,u.id unit_id,m.daily_rate_php from public.customers c join auth.users a on a.id=c.auth_user_id cross join public.motorcycle_models m join public.motorcycle_units u on u.motorcycle_model_id=m.id where c.is_test and a.email like '%@example.invalid' and m.slug='honda-adv-160' and u.status='available' and u.archived_at is null order by c.id,u.id limit 1;`);
  if (!fixture) throw Error("Synthetic staging fixture missing");
  report.originalSettings = (await query(`select jsonb_build_object('live',(select to_jsonb(s) from public.paymongo_live_settings s where id),'notifications',(select to_jsonb(s) from public.notification_settings s where id),'delivery',(select to_jsonb(s) from public.delivery_settings s where id)) settings;`))[0].settings;
  await query(`begin;update public.notification_settings set telegram_enabled=false,resend_enabled=false where id;update public.paymongo_live_settings set enabled=true,migration_verified=true,webhook_verified=true,reconciliation_verified=true,concurrency_verified=true where id;update public.delivery_settings set qrph_enabled=true where id;commit;select true as staging_simulation_only;`);
  async function make(day, { guest = false, confirmed = true, services = 0 } = {}) {
    const id = uid();
    const access = uid().replaceAll("-", "").repeat(2);
    const customer = guest ? uid() : fixture.customer_id;
    const start = `2032-06-${String(day).padStart(2,"0")}T01:00:00Z`;
    const end = `2032-06-${String(day+1).padStart(2,"0")}T01:00:00Z`;
    const owner = guest ? "null" : quote(fixture.owner);
    const sql = `begin;set local statement_timeout='30s';
      ${guest ? `insert into public.customers(id,auth_user_id,full_name,email,is_test) values(${quote(customer)},null,'KJM staging synthetic payment fixture',${quote(`payment-${id}@example.invalid`)},true);` : ""}
      insert into public.bookings(id,booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,base_total_php,services_total_php,pricing_daily_rate_php,pricing_units,deposit_required_centavos,is_test,expires_at)
      select ${quote(id)},${quote('LIVE-STAGING-'+id)},${quote(customer)},${quote(fixture.model_id)},${quote(start)},${quote(end)},'pending',q.total_php+${services},q.total_php,${services},q.daily_rate_php,q.pricing_units,250000,false,now()+interval '1 day' from private.calculate_booking_quote(${quote(fixture.model_id)},${quote(start)},${quote(end)},false) q;
      insert into public.booking_deposits(booking_id,option,required_centavos,partial_return_allowed,collection_instructions,return_instructions,dispute_instructions,policy_version,request_fingerprint,is_test) values(${quote(id)},'cash',250000,false,'Synthetic staging deposit','Synthetic staging return','Synthetic staging review',now(),'management-staging-payment-verification',false);
      insert into public.booking_terms_acceptances(booking_id,auth_user_id,terms_version,source_sha256) select ${quote(id)},${owner},version,source_sha256 from public.rental_terms_versions where is_current;
      insert into public.booking_confirmation_records(booking_id,motorcycle_unit_id,auth_user_id) values(${quote(id)},${quote(fixture.unit_id)},${owner});
      ${guest ? `insert into public.guest_booking_contacts(booking_id,access_hash,email,request_fingerprint) values(${quote(id)},${quote(access)},${quote(`payment-${id}@example.invalid`)},'management-staging-payment-verification');insert into public.booking_services(booking_id,delivery_fee_centavos,collection_fee_centavos,payment_method) values(${quote(id)},${services*100},0,'qrph');` : ""}
      ${confirmed ? `update public.bookings set status='confirmed',motorcycle_unit_id=${quote(fixture.unit_id)},expires_at=null where id=${quote(id)};` : ""}
      select id,round(quoted_total_php*100)::integer amount,deposit_required_centavos deposit from public.bookings where id=${quote(id)};commit;`;
    report.bookings.push(id);
    const [made] = await query(sql);
    return { ...made, access, guest };
  }
  const registered = await make(10);
  ok("Registered fixture preserves rental rate and separate deposit", registered.amount === fixture.daily_rate_php * 100 && registered.deposit === 250000);
  const key = uid();
  const prepare = `select (public.prepare_paymongo_live_checkout(${quote(registered.id)},${quote(fixture.owner)},${quote(key)})).id as id,pg_backend_pid() as pid`;
  const prepared = await race([prepare, prepare]);
  ok("Concurrent preparation returns one intent on distinct backends", prepared.every(r=>r.success) && prepared[0].rows[0].id===prepared[1].rows[0].id && prepared[0].rows[0].pid!==prepared[1].rows[0].pid);
  const checkout = prepared[0].rows[0].id;
  const claims = await race([0,1].map(()=>`select public.claim_paymongo_live_creation(${quote(checkout)}) claimed,pg_backend_pid() pid`));
  ok("Exactly one concurrent provider creation claim", claims.every(r=>r.success) && claims.filter(r=>r.rows[0].claimed).length===1 && claims[0].rows[0].pid!==claims[1].rows[0].pid);
  const session = 'cs_staging'+uid().replaceAll('-','');
  const payment = 'pay_staging'+uid().replaceAll('-','');
  await query(`select public.attach_paymongo_live_session(${quote(checkout)},${quote(session)});`);
  await denied("LIVE settlement rejects TEST provenance", `select public.settle_paymongo_live_checkout(${quote(session)},${quote(payment)},${registered.amount},'PHP',false)`);
  const settle = `select public.settle_paymongo_live_checkout(${quote(session)},${quote(payment)},${registered.amount},'PHP',true) status,pg_backend_pid() pid`;
  const settled = await race([settle,settle]);
  ok("Concurrent duplicate settlements succeed idempotently", settled.every(r=>r.success && r.rows[0].status==='paid') && settled[0].rows[0].pid!==settled[1].rows[0].pid);
  const [ledger] = await query(`select (select count(*) from public.payment_events where payment_intent_id=${quote(checkout)}) events,(select count(*) from public.payment_intents where id=${quote(checkout)}) intents,(select count(*) from public.payment_attempts where payment_intent_id=${quote(checkout)}) attempts,(select sum(amount_centavos) from public.payment_events where payment_intent_id=${quote(checkout)}) paid,(select required_centavos from public.booking_deposits where booking_id=${quote(registered.id)}) deposit;`);
  ok("One ledger credit, intent and attempt; deposit excluded", ledger.events===1 && ledger.intents===1 && ledger.attempts===1 && Number(ledger.paid)===registered.amount && ledger.deposit===250000);
  await denied("Different second payment cannot double-credit", `select public.settle_paymongo_live_checkout(${quote(session)},'pay_stagingOther',${registered.amount},'PHP',true)`);
  await denied("Payment locks booked dates", `update public.bookings set end_at=end_at+interval '1 day' where id=${quote(registered.id)}`);
  const guest = await make(12,{guest:true,services:100});
  const [g] = await query(`select set_config('request.jwt.claim.role','service_role',true);select (public.prepare_paymongo_guest_checkout(${quote(guest.id)},${quote(guest.access)},${quote(uid())})).id id;`);
  ok("Guest rental includes services and excludes cash deposit", !!g.id && guest.amount===fixture.daily_rate_php*100+10000 && guest.deposit===250000);
  const gs = 'cs_staging'+uid().replaceAll('-','');
  const gp = 'pay_staging'+uid().replaceAll('-','');
  await query(`select public.claim_paymongo_live_creation(${quote(g.id)});select public.attach_paymongo_live_session(${quote(g.id)},${quote(gs)});`);
  const [recovered] = await query(`select public.settle_paymongo_live_checkout(${quote(gs)},${quote(gp)},${guest.amount},'PHP',true) as status;`);
  ok("Guest settlement supports null authenticated actor", recovered.status==='paid');
  const [gl] = await query(`select count(*) events,sum(amount_centavos) paid,bool_and(recorded_by is null) guest_actor from public.payment_events where payment_intent_id=${quote(g.id)};`);
  ok("Guest ledger credits saved rental plus services exactly once", gl.events===1 && Number(gl.paid)===guest.amount && gl.guest_actor);
  const [again] = await query(`select public.settle_paymongo_live_checkout(${quote(gs)},${quote(gp)},${guest.amount},'PHP',true) as status;`);
  ok("Guest recovery retry is idempotent", again.status==='paid');
  const event='evt_staging'+uid().replaceAll('-','');const hash='a'.repeat(64);
  const [before] = await query(`select public.paymongo_live_event_completed(${quote(event)},${quote(hash)}) completed;`);
  await query(`select public.paymongo_live_event_completed(${quote(event)},${quote(hash)},true);`);
  const [after] = await query(`select public.paymongo_live_event_completed(${quote(event)},${quote(hash)}) completed;`);
  ok("Webhook identity is complete only after recorded completion", before.completed===false && after.completed===true);
  await denied("Reused webhook event with altered payload is rejected", `select public.paymongo_live_event_completed(${quote(event)},${quote('b'.repeat(64))},true)`);
  const late = await make(14);
  const [li] = await query(`select (public.prepare_paymongo_live_checkout(${quote(late.id)},${quote(fixture.owner)},${quote(uid())})).id id;`);
  const ls='cs_staging'+uid().replaceAll('-','');
  await query(`select public.claim_paymongo_live_creation(${quote(li.id)});select public.attach_paymongo_live_session(${quote(li.id)},${quote(ls)});update public.paymongo_live_checkouts set created_at=now()-interval '2 hours',checkout_deadline=now()-interval '1 hour' where id=${quote(li.id)};`);
  const [l] = await query(`select public.settle_paymongo_live_checkout(${quote(ls)},${quote('pay_staging'+uid().replaceAll('-',''))},${late.amount},'PHP',true) status;`);
  const [lc] = await query(`select count(*) n from public.payment_events where payment_intent_id=${quote(li.id)};`);
  ok("Late payment requires review without ledger credit", l.status==='review_required' && lc.n===0);
  await require('./recovery-source-integration.cjs')({ query,make,ok });
  report.success=true;
}
main().catch(error=>{report.error=error.message;process.exitCode=1;console.error(error.message);}).finally(async()=>{
  try {
    // Keep the staging foundation OFF and cancel only this run's synthetic reservations.
    await query(`begin;update public.paymongo_live_settings set enabled=false,migration_verified=false,webhook_verified=false,reconciliation_verified=false,concurrency_verified=false where id;update public.delivery_settings set qrph_enabled=false where id;${report.bookings.length?`update public.bookings set status='cancelled',status_reason='Isolated staging payment verification complete' where id in (${report.bookings.map(quote).join(',')}) and booking_reference like 'LIVE-STAGING-%' and status in ('pending','confirmed');`:''}commit;select true as cleanup_completed;`);
    report.cleanupCompleted=true;
  } catch(error) {report.cleanupError=error.message;process.exitCode=1;}
  fs.writeFileSync(path.join(__dirname,'management-staging-results.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  fs.rmdirSync(folder);
  console.log(JSON.stringify({passed:report.results.length,success:!!report.success,cleanupCompleted:!!report.cleanupCompleted}));
});
