/* eslint-disable @typescript-eslint/no-require-imports -- Explicitly approved dedicated TEST owner access. */
const fs=require('fs');const {client,ref}=require('../docs/phase9-migration020/connection.cjs');
(async()=>{const c=client();try{
 if(ref!=='uuxjymzrtncrnnkvdpjy')throw Error('Dedicated TEST required');
 const settings=JSON.parse(fs.readFileSync('.paymongo-tools/booking-policy.json'));
 const business=JSON.parse(fs.readFileSync('.paymongo-tools/business-policy.json'));
 const login=JSON.parse(fs.readFileSync('.paymongo-tools/local-login.json'));
 if(!login.email.endsWith('@example.invalid')||business.deposit.cash_amount_centavos!==250000)throw Error('Approved TEST account/policy required');
 await c.connect();await c.query('begin');
 const admin=(await c.query("select a.auth_user_id from public.admin_users a join auth.users u on u.id=a.auth_user_id where a.is_active and u.email like '%@example.invalid' limit 1")).rows[0];
 if(!admin)throw Error('TEST administrator required');
 const cols=Object.keys(settings);await c.query('update public.booking_settings set '+cols.map((k,i)=>'"'+k+'"=$'+(i+1)).join(',')+',public_booking_enabled=false where id=true',cols.map(k=>settings[k]&&typeof settings[k]==='object'?JSON.stringify(settings[k]):settings[k]));
 await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:admin.auth_user_id,role:'authenticated',is_anonymous:false})]);
 await c.query('set local role authenticated');
 await c.query('select public.admin_save_security_deposit_settings($1)',[business.deposit]);
 await c.query("select public.admin_set_booking_tester($1,now()+interval '24 hours',true)",[login.id]);
 await c.query('reset role');
 let added=0;for(const model of business.inventory){
  const m=(await c.query('select id from public.motorcycle_models where slug=$1',[model.slug])).rows[0];if(!m)continue;
  const count=(await c.query('select count(*)::int n from public.motorcycle_units where motorcycle_model_id=$1 and archived_at is null',[m.id])).rows[0].n;
  if(count<model.quantity){await c.query('set local role authenticated');await c.query('select public.admin_set_motorcycle_quantity($1,$2,$3)',[m.id,model.quantity,count]);await c.query('reset role');added+=model.quantity-count;}
 }
 await c.query('commit');console.log(JSON.stringify({existingAccountAuthorizedHours:24,realDepositPHP:2500,testInventoryAddedFromOriginalQuantities:added,publicBookingEnabled:false,productionWrites:0}));
}catch(e){await c.query('rollback').catch(()=>{});console.log(JSON.stringify({failed:true,code:e.code,message:e.message}));process.exitCode=1;}finally{await c.end();}})();
