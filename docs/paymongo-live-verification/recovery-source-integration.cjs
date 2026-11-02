/* eslint-disable @typescript-eslint/no-require-imports -- Run current payment source against real isolated staging SQL; provider transport is simulated. */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { createHmac, randomUUID } = require("node:crypto");
const root = path.resolve(__dirname, "../..");
module.exports = async function recoveryIntegration({ query, make, ok }) {
  const q = value => "'" + String(value).replaceAll("'", "''") + "'";
  const booking = await make(16, { guest: true, services: 100 });
  const [intent] = await query(`select set_config('request.jwt.claim.role','service_role',true);select (public.prepare_paymongo_guest_checkout(${q(booking.id)},${q(booking.access)},${q(randomUUID())})).id id;`);
  await query(`select public.claim_paymongo_live_creation(${q(intent.id)});`);
  const sessionId = 'cs_recovery'+randomUUID().replaceAll('-','');
  const paymentId = 'pay_recovery'+randomUUID().replaceAll('-','');
  const eventId = 'evt_recovery'+randomUUID().replaceAll('-','');
  const providerSession = { id: sessionId, type: 'checkout_session', attributes: {
    livemode: true, reference_number: intent.id, status: 'active',
    line_items: [{ name: 'Synthetic staging rental and services', amount: booking.amount, currency: 'PHP', quantity: 1 }],
    payments: [{ id: paymentId, type: 'payment', attributes: { amount: booking.amount, currency: 'PHP', livemode: true, status: 'paid' } }],
  } };
  const allowed = new Set(['read_paymongo_live_checkout','attach_paymongo_live_session','settle_paymongo_live_checkout','note_paymongo_provider_status','paymongo_live_event_completed']);
  const db = { rpc: async (name,args) => {
    if (!allowed.has(name)) throw Error('Unexpected staging RPC: '+name);
    const literal = v => v===null?'null':typeof v==='boolean'?String(v):typeof v==='number'?String(v):q(v);
    try {
      const [row] = await query(`select set_config('request.jwt.claim.role','service_role',true);select public.${name}(${Object.entries(args).map(([k,v])=>k+'=>'+literal(v)).join(',')}) value;`);
      return { data: row.value, error: null };
    } catch (error) { return { data: null,error:{message:error.message} }; }
  } };
  const environment = {
    PAYMONGO_MODE:'live',PAYMONGO_LIVE_SECRET_KEY:'sk_live_synthetic_not_a_real_key',
    PAYMONGO_LIVE_WEBHOOK_SECRET:'staging_synthetic_webhook_secret',PAYMONGO_LIVE_RECONCILIATION_SECRET:'x'.repeat(64),
    NEXT_PUBLIC_SUPABASE_URL:'https://slevojynuumrvgiznmxk.supabase.co',PAYMONGO_APP_ORIGIN:'https://kjm.example',
    SUPABASE_SERVICE_ROLE_KEY:`test.${Buffer.from(JSON.stringify({ref:'slevojynuumrvgiznmxk',role:'service_role'})).toString('base64url')}.synthetic`,
  };
  let providerCalls = 0;
  function load(file, resolver) {
    const exports = {};
    const context = { exports,module:{exports},require:resolver,Buffer,Date,URL,AbortSignal,Request,Response,
      console,process:{env:environment},fetch:async(url,init)=>{
        if(url!==`https://api.paymongo.com/v1/checkout_sessions/${sessionId}` || init.method!=='GET') throw Error('Unexpected simulated provider call');
        providerCalls++;
        return Response.json({data:providerSession});
      } };
    const source = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(source,context,{filename:file});
    return context.module.exports;
  }
  const payments = load('src/lib/paymongo/test-payments.ts',name=>{
    if(name==='./mode')return {paymongoLiveMode:()=>true};
    if(name==='./payment-methods')return {supportedCheckoutMethods:()=>['qrph']};
    return require(name);
  });
  const original = (await db.rpc('read_paymongo_live_checkout',{p_checkout_id:intent.id})).data;
  ok('Recovery fixture has a creation claim but no attached session',original.creation_claimed_at && !original.checkout_session_id);
  const recovered = await payments.reconcile(db,original,sessionId);
  ok('Current reconciliation source attaches and settles a lost creation response',recovered.status==='paid');
  const webhook = load('src/app/api/paymongo/webhook/route.ts',name=>{
    if(name==='@/lib/paymongo/test-payments')return {...payments,databaseClient:()=>db};
    if(name==='@/lib/paymongo/live-verification')return {verificationReference:/^KJM-LIVE-VERIFY-/,verifyLivePayment:()=>{throw Error('Wrong verification branch');}};
    return require(name);
  });
  const raw = JSON.stringify({data:{id:eventId,type:'event',attributes:{livemode:true,type:'checkout_session.payment.paid',data:providerSession}}});
  function request(valid=true) {
    const stamp = Math.floor(Date.now()/1000);
    const signature = createHmac('sha256',environment.PAYMONGO_LIVE_WEBHOOK_SECRET).update(stamp+'.'+raw).digest('hex');
    return new Request('https://kjm.example/api/paymongo/webhook',{method:'POST',body:raw,headers:{'paymongo-signature':valid?`t=${stamp},li=${signature}`:'invalid'}});
  }
  const bad = await webhook.POST(request(false));
  ok('Current webhook rejects invalid signatures before provider retrieval',bad.status===401 && providerCalls===1);
  const first = await webhook.POST(request());
  ok('Current webhook accepts delayed notification after cron-style recovery',first.status===200 && (await first.json()).ok===true);
  const callsBeforeDuplicate=providerCalls;
  const second = await webhook.POST(request());
  ok('Repeated webhook is skipped without a provider request or second settlement',second.status===200 && (await second.json()).duplicate===true && providerCalls===callsBeforeDuplicate);
  const [ledger] = await query(`select count(*) events,sum(amount_centavos) paid from public.payment_events where payment_intent_id=${q(intent.id)};`);
  ok('Recovery and repeated notifications leave one rental/service credit',ledger.events===1 && Number(ledger.paid)===booking.amount);
  const [guestView] = await query(`begin;select set_config('request.jwt.claim.role','service_role',true);set local role service_role;select public.get_guest_payment_checkout(${q(booking.id)},${q(booking.access)})=${q(intent.id)}::uuid as owned_checkout,(select sum(case event_type when 'payment' then amount_centavos else -amount_centavos end) from public.payment_events where booking_id=${q(booking.id)}) >= (select total_centavos from public.bookings where id=${q(booking.id)}) as paid;rollback;`);
  ok('MAIN guest status data reports the saved booking paid',guestView.owned_checkout && guestView.paid);
  const [admin] = await query(`select auth_user_id from public.admin_users where is_active order by id limit 1;`);
  if(!admin)throw Error('An existing staging admin is required for the ADMIN status data check');
  const [adminView] = await query(`begin;select set_config('request.jwt.claim.sub',${q(admin.auth_user_id)},true);set local role authenticated;select c.status,c.amount_centavos,r.payment_id is not null as receipt from public.paymongo_live_checkouts c join public.paymongo_live_receipts r on r.checkout_id=c.id where c.id=${q(intent.id)};rollback;`);
  ok('ADMIN status data exposes one verified receipt through its existing RLS',adminView?.status==='paid' && adminView.amount_centavos===booking.amount && adminView.receipt);
  async function compete(first, second, dml = false) {
    const run = async sql => {
      try { return { success:true,rows:await query(`begin;set local statement_timeout='40s';${sql};commit;`) }; }
      catch(error) { return {success:false,error:error.message}; }
    };
    const held = run(dml ? first+',pg_sleep(20)' : `with result as materialized (${first}) select result.*,pg_sleep(20) from result`);
    await new Promise(resolve=>setTimeout(resolve,10000));
    return Promise.all([held,run(second)]);
  }
  const collision = await make(18);
  const [row] = await query(`select customer_id,motorcycle_unit_id from public.bookings where id=${q(collision.id)};`);
  const cashSql = id => `insert into public.payment_intents(id,booking_id,idempotency_key,kind,amount_centavos,status,provider,request_fingerprint,is_test) values(${q(id)},${q(collision.id)},${q(id)},'charge',${collision.amount},'processing','cash','{}',false) returning id,pg_backend_pid() pid`;
  const cashRace = await compete(
    `select (public.prepare_paymongo_live_checkout(${q(collision.id)},(select auth_user_id from public.customers where id=${q(row.customer_id)}),${q(randomUUID())})).id id,pg_backend_pid() pid`,
    cashSql(randomUUID()));
  ok('Online preparation excludes a concurrent cash charge',cashRace[0].success && !cashRace[1].success);
  const cashFirst = await make(20);
  const cashId=randomUUID();
  const reversed = await compete(
    `insert into public.payment_intents(id,booking_id,idempotency_key,kind,amount_centavos,status,provider,request_fingerprint,is_test) values(${q(cashId)},${q(cashFirst.id)},${q(cashId)},'charge',${cashFirst.amount},'processing','cash','{}',false) returning id,pg_backend_pid() pid`,
    `select (public.prepare_paymongo_live_checkout(${q(cashFirst.id)},(select c.auth_user_id from public.customers c join public.bookings b on b.customer_id=c.id where b.id=${q(cashFirst.id)}),${q(randomUUID())})).id id,pg_backend_pid() pid`,true);
  ok('A concurrent cash charge excludes online preparation',reversed[0].success && !reversed[1].success);
  const a=await make(22,{confirmed:false}), b=await make(22,{confirmed:false});
  const confirm = id => `update public.bookings set status='confirmed',motorcycle_unit_id=${q(row.motorcycle_unit_id)},expires_at=null where id=${q(id)} returning id,pg_backend_pid() pid`;
  const inventory = await compete(confirm(a.id),confirm(b.id),true);
  ok('Competing confirmations for the same motorcycle have one winner',inventory.filter(x=>x.success).length===1);
};
