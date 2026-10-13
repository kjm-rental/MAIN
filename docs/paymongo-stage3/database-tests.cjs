/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS staging-only verification harness. */
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {client,ref}=require('../phase9-migration020/connection.cjs');
const testDay=Date.UTC(2050,0,1)+Math.floor(Math.random()*10000)*86400000;
const DATE_A=new Date(testDay).toISOString(),DATE_B=new Date(testDay+86400000).toISOString();
const results=[];const report={dedicatedTestVerified:ref==='uuxjymzrtncrnnkvdpjy',productionContacted:false,results};
function ok(name,pass){if(!pass)throw Error(name);results.push({name,passed:true});}
async function denied(c,name,sql,args,match){await c.query('savepoint deny');try{await c.query(sql,args);throw Error('Unexpected success');}catch(e){await c.query('rollback to savepoint deny');ok(name,match.test(e.message));}await c.query('release savepoint deny');}
async function race(ops){const cs=ops.map(()=>client());try{await Promise.all(cs.map(c=>c.connect()));const pids=await Promise.all(cs.map(async c=>{await c.query("begin;set local statement_timeout='15s'");return(await c.query('select pg_backend_pid() pid')).rows[0].pid;}));ok('Independent PostgreSQL backends',new Set(pids).size===cs.length);return await Promise.all(cs.map(async(c,i)=>{try{const r=await c.query(ops[i].sql,ops[i].args);await c.query('commit');return {ok:true,rows:r.rows};}catch(e){await c.query('rollback');return {ok:false,code:e.code};}}));}finally{await Promise.all(cs.map(c=>c.end()));}}
(async()=>{const c=client();try{
 if(!report.dedicatedTestVerified)throw Error('Unverified target');await c.connect();
 const tables=(await c.query("select relname,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('paymongo_test_settings','paymongo_test_checkouts','paymongo_test_receipts','paymongo_test_webhook_events')")).rows;
 ok('Four tables with forced RLS',tables.length===4&&tables.every(t=>t.relrowsecurity&&t.relforcerowsecurity));
 const funcs=(await c.query("select proname,prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated,has_function_privilege('service_role',oid,'EXECUTE') service from pg_proc where pronamespace='public'::regnamespace and proname in ('prepare_paymongo_test_checkout','attach_paymongo_test_session','settle_paymongo_test_checkout','claim_paymongo_test_creation','read_paymongo_test_checkout','list_paymongo_test_checkouts','paymongo_test_event_completed')")).rows;
 ok('Seven server-only SECURITY DEFINER RPCs with empty search paths',funcs.length===7&&funcs.every(f=>f.prosecdef&&!f.anon&&!f.authenticated&&f.service&&f.proconfig.some(s=>s==='search_path=""')));
 const privileges=(await c.query("select relname,has_table_privilege('service_role',oid,'INSERT') service_insert,has_table_privilege('authenticated',oid,'INSERT') user_insert,has_table_privilege('anon',oid,'SELECT') anon_read from pg_class where relnamespace='public'::regnamespace and relname like 'paymongo_test_%' and relkind='r'")).rows;
 ok('No direct ledger writes or anonymous reads',privileges.every(p=>!p.service_insert&&!p.user_insert&&!p.anon_read));
 const fixture=(await c.query("select b.*,u.id owner from public.bookings b join public.customers c on c.id=b.customer_id join auth.users u on u.id=c.auth_user_id where b.is_test and c.is_test and u.email like '%@example.invalid' and b.status='confirmed' and b.end_at>now() and b.motorcycle_unit_id is not null and not exists(select 1 from public.payment_intents where booking_id=b.id) and not exists(select 1 from public.paymongo_test_checkouts where booking_id=b.id) order by b.created_at limit 1")).rows[0];
 if(!fixture)throw Error('No safe synthetic confirmed fixture available');
 if(!process.env.PAYMONGO_CONCURRENCY_ONLY){
 const key=randomUUID(),session='cs_'+randomUUID().replaceAll('-',''),pay='pay_'+randomUUID().replaceAll('-','');
 await c.query('begin');await c.query("set local statement_timeout='15s'");
 await denied(c,'Creation disabled by default','select public.prepare_paymongo_test_checkout($1,$2,$3)',[fixture.id,fixture.owner,key],/disabled/);
 // These gates exist only inside this transaction and are rolled back, never globally enabled.
 await c.query('update public.paymongo_test_settings set migration_verified=true,webhook_verified=true,reconciliation_verified=true,concurrency_verified=true,enabled=true');
 // Historic synthetic confirmed bookings carry expired timestamps. Fix only
 // this rollback-only fixture; no existing reservation changes persist.
 await c.query('update public.bookings set expires_at=null where id=$1',[fixture.id]);
 await c.query("insert into public.booking_terms_acceptances(booking_id,auth_user_id,terms_version,source_sha256) select $1,$2,version,source_sha256 from public.rental_terms_versions where is_current on conflict do nothing",[fixture.id,fixture.owner]);
 await c.query('savepoint active_booking');
 await c.query("update public.bookings set expires_at=now()-interval '1 minute' where id=$1",[fixture.id]);
 await denied(c,'Expired reservation cannot prepare checkout','select public.prepare_paymongo_test_checkout($1,$2,$3)',[fixture.id,fixture.owner,key],/reserved/);
 await c.query('rollback to savepoint active_booking');
 const intent=(await c.query('select (public.prepare_paymongo_test_checkout($1,$2,$3)).*',[fixture.id,fixture.owner,key])).rows[0];
 const repeated=(await c.query('select (public.prepare_paymongo_test_checkout($1,$2,$3)).id',[fixture.id,fixture.owner,key])).rows[0];
 ok('Identical preparation is idempotent',repeated.id===intent.id&&Number(intent.amount_centavos)===Math.round(Number(fixture.quoted_total_php)*100));
 await denied(c,'Different preparation key cannot duplicate booking payment','select public.prepare_paymongo_test_checkout($1,$2,$3)',[fixture.id,fixture.owner,randomUUID()],/already exists/);
 await denied(c,'Wrong owner denied','select public.prepare_paymongo_test_checkout($1,$2,$3)',[fixture.id,randomUUID(),key],/Owned/);
 ok('Exactly one creation claim',(await c.query('select public.claim_paymongo_test_creation($1) won',[intent.id])).rows[0].won===true&&(await c.query('select public.claim_paymongo_test_creation($1) won',[intent.id])).rows[0].won===false);
 await c.query('select public.attach_paymongo_test_session($1,$2)',[intent.id,session]);
 await denied(c,'Real/live payment rejected','select public.settle_paymongo_test_checkout($1,$2,$3,$4,$5)',[session,pay,intent.amount_centavos,'PHP',true],/Invalid/);
 await denied(c,'Changed amount rejected','select public.settle_paymongo_test_checkout($1,$2,$3,$4,$5)',[session,pay,Number(intent.amount_centavos)+1,'PHP',false],/Invalid/);
 await denied(c,'Quoted reservation cannot be rescheduled','update public.bookings set end_at=end_at+interval \'1 hour\' where id=$1',[fixture.id],/immutable/);
 await c.query('savepoint before_receipt');
 const settle=()=>c.query('select public.settle_paymongo_test_checkout($1,$2,$3,$4,$5) status',[session,pay,intent.amount_centavos,'PHP',false]);
 ok('Verified payment and duplicate delivery settle once',(await settle()).rows[0].status==='paid'&&(await settle()).rows[0].status==='paid');
 await denied(c,'Different duplicate payment rejected','select public.settle_paymongo_test_checkout($1,$2,$3,$4,$5)',[session,'pay_other',intent.amount_centavos,'PHP',false],/Different payment/);
 await denied(c,'Receipt immutable','update public.paymongo_test_receipts set amount_centavos=amount_centavos+1 where checkout_id=$1',[intent.id],/immutable/);
 await c.query('rollback to savepoint before_receipt');
 await c.query("update public.paymongo_test_checkouts set created_at=now()-interval '2 hours',checkout_deadline=now()-interval '1 hour' where id=$1",[intent.id]);
 ok('Delayed payment requires review without changing reservation',(await settle()).rows[0].status==='review_required');
 await c.query('rollback');
 }
 // New, explicitly synthetic fixtures only; retained for audit, no customer deletion.
 const bookings=[randomUUID(),randomUUID()];const tag=randomUUID().replaceAll('-','');
 await c.query('begin');
 for(const booking of bookings)await c.query(`insert into public.bookings(id,booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,base_total_php,is_test,expires_at) values($1,$2,$3,$4,'${DATE_A}','${DATE_B}','pending',100,100,true,now()+interval '30 minutes')`,[booking,'PM-TEST-'+booking,fixture.customer_id,fixture.motorcycle_model_id]);
 for(const booking of bookings){
  await c.query("insert into public.booking_deposits(booking_id,option,required_centavos,partial_return_allowed,collection_instructions,return_instructions,dispute_instructions,policy_version,request_fingerprint,is_test) values($1,'cash',10000,false,'Synthetic TEST collection','Synthetic TEST return','Synthetic TEST dispute',now(),'paymongo-concurrency-fixture',true)",[booking]);
  await c.query('update public.bookings set deposit_required_centavos=10000 where id=$1',[booking]);
 }
 const concurrentIntent=randomUUID();
 await c.query(`insert into public.paymongo_test_checkouts(id,booking_id,customer_user_id,idempotency_key,amount_centavos,motorcycle_unit_id,start_at,end_at,checkout_deadline,creation_claimed_at,checkout_session_id,status) values($1,$2,$3,$4,10000,$5,'${DATE_A}','${DATE_B}',now()+interval '30 minutes',now(),$6,'session_created')`,[concurrentIntent,bookings[0],fixture.owner,randomUUID(),fixture.motorcycle_unit_id,'cs_'+tag]);
 await c.query('commit');report.retainedSyntheticBookings=bookings;
 const concurrent=await race([0,1].map(()=>({sql:'select public.settle_paymongo_test_checkout($1,$2,10000,\'PHP\',false) status',args:['cs_'+tag,'pay_'+tag]})));
 ok('Concurrent duplicate settlements produce one receipt',concurrent.every(r=>r.ok&&r.rows[0].status==='review_required')&&(await c.query('select count(*)::int n from public.paymongo_test_receipts where checkout_id=$1',[concurrentIntent])).rows[0].n===1);
 const holds=await race(bookings.map(booking=>({sql:`insert into public.booking_inventory_holds(booking_id,motorcycle_unit_id,start_at,end_at,expires_at) values($1,$2,'${DATE_A}','${DATE_B}',now()+interval '30 minutes')`,args:[booking,fixture.motorcycle_unit_id]})));
 report.holdRaceOutcomes=holds;
 ok('Concurrent overlapping reservation holds cannot both succeed',holds.filter(r=>r.ok).length===1&&holds.some(r=>['23P01','40P01'].includes(r.code)));
 ok('Readiness remains disabled',(await c.query('select enabled from public.paymongo_test_settings')).rows[0].enabled===false);
 report.passed=true;
 fs.writeFileSync(path.join(__dirname,'database-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(e){await c.query('rollback').catch(()=>{});report.failed=true;report.error={code:e.code||null,message:e.message};fs.writeFileSync(path.join(__dirname,'database-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exitCode=1;}finally{await c.end();}})();
