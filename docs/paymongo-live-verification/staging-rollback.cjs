/* eslint-disable @typescript-eslint/no-require-imports -- Dedicated staging rollback-only verification. */
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {client,ref}=require('../phase9-migration020/connection.cjs');
const results=[];
function ok(name,value){if(!value)throw Error(name);results.push({name,passed:true});}
async function denied(c,name,sql,args,code){await c.query('savepoint negative');let rejected=false;try{await c.query(sql,args);}catch(e){rejected=code?e.code===code:true;await c.query('rollback to savepoint negative');}await c.query('release savepoint negative');ok(name,rejected);}
(async()=>{const c=client();const report={productionContacted:false,rollbackOnly:true,results};try{
 if(ref!=='uuxjymzrtncrnnkvdpjy')throw Error('Verified staging required');await c.connect();
 const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/202610130026_paymongo_live_booking_payments.sql'),'utf8');report.migrationSHA256=createHash('sha256').update(sql).digest('hex');
 await c.query('begin');await c.query("set local lock_timeout='5s';set local statement_timeout='20s'");
 await c.query(sql.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,''));
 ok('Exact migration compiles',true);
 const tables=(await c.query("select relrowsecurity,relforcerowsecurity,has_table_privilege('service_role',oid,'insert') direct_insert from pg_class where relnamespace='public'::regnamespace and relname like 'paymongo_live_%' and relkind='r'")).rows;
 ok('Four forced-RLS tables; no service direct inserts',tables.length===4&&tables.every(t=>t.relrowsecurity&&t.relforcerowsecurity&&!t.direct_insert));
 const functions=(await c.query("select prosecdef,proconfig,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') customer,has_function_privilege('service_role',oid,'execute') service from pg_proc where pronamespace='public'::regnamespace and proname like '%paymongo_live%'")).rows;
 ok('Nine service-only RPCs with empty search paths',functions.length===9&&functions.every(f=>f.prosecdef&&!f.anon&&!f.customer&&f.service&&f.proconfig.includes('search_path=""')));
 ok('Readiness stays disabled',(await c.query('select public.paymongo_live_ready() ready')).rows[0].ready===false);
 const b=(await c.query("select b.*,c.auth_user_id owner from public.bookings b join public.customers c on c.id=b.customer_id join auth.users u on u.id=c.auth_user_id where b.is_test and u.email like '%@example.invalid' and b.motorcycle_unit_id is not null and b.quoted_total_php>0 limit 1")).rows[0];if(!b)throw Error('Safe existing staging fixture unavailable');
 const key=randomUUID(),session='cs_'+randomUUID().replaceAll('-',''),payment='pay_'+randomUUID().replaceAll('-','');
 // Direct owner inserts are only fixture construction inside this rollback;
 // application roles cannot construct LIVE intents for TEST-marked bookings.
 const baseline=(await c.query('select count(*)::int n from public.payment_events')).rows[0].n;
 await c.query("insert into public.paymongo_live_checkouts(id,booking_id,customer_user_id,idempotency_key,amount_centavos,motorcycle_unit_id,start_at,end_at,created_at,checkout_deadline,checkout_session_id,creation_claimed_at,status) values($1,$2,$3,$4,$5,$6,$7,$8,now()-interval '2 hours',now()-interval '1 hour',$9,now()-interval '2 hours','session_created')",[key,b.id,b.owner,randomUUID(),Math.round(Number(b.quoted_total_php)*100),b.motorcycle_unit_id,b.start_at,b.end_at,session]);
 await denied(c,'TEST payment rejected by LIVE settlement','select public.settle_paymongo_live_checkout($1,$2,$3,\'PHP\',false)',[session,payment,Math.round(Number(b.quoted_total_php)*100)],'P0001');
 await denied(c,'TEST provenance forbidden on LIVE intents','update public.paymongo_live_checkouts set is_test=true where id=$1',[key],'23514');
 const settle=()=>c.query('select public.settle_paymongo_live_checkout($1,$2,$3,\'PHP\',true) status',[session,payment,Math.round(Number(b.quoted_total_php)*100)]);
 ok('Late/mode-mismatched reservation requires review',(await settle()).rows[0].status==='review_required');
 ok('Repeated identical settlement is idempotent',(await settle()).rows[0].status==='review_required');
 await denied(c,'Different duplicate payment rejected','select public.settle_paymongo_live_checkout($1,$2,$3,\'PHP\',true)',[session,'pay_different',Math.round(Number(b.quoted_total_php)*100)],'P0001');
 ok('Review receipt never credits existing financial ledger',(await c.query('select count(*)::int n from public.payment_events')).rows[0].n===baseline);
 const hash='a'.repeat(64);
 await c.query('select public.paymongo_live_event_completed(\'evt_staging\',$1,true)',[hash]);
 ok('Webhook duplicate identity recorded',(await c.query('select public.paymongo_live_event_completed(\'evt_staging\',$1,false) duplicate',[hash])).rows[0].duplicate);
 await denied(c,'Webhook identity cannot change payload','select public.paymongo_live_event_completed(\'evt_staging\',$1,false)',['b'.repeat(64)],'P0001');
 await c.query('rollback');
 ok('No migration objects persisted',(await c.query("select to_regclass('public.paymongo_live_checkouts') name")).rows[0].name===null);
 report.passed=true;
}catch(e){await c.query('rollback').catch(()=>{});report.failed=true;report.reason=e.code?`SQL ${e.code}`:e.message;process.exitCode=1;}finally{await c.end();fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}})();
