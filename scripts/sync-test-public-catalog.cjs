/* eslint-disable @typescript-eslint/no-require-imports -- Guarded Node-only catalog synchronization. */
const fs=require('node:fs'),path=require('node:path'),{parseEnv}=require('node:util');
const {createClient}=require('@supabase/supabase-js');
const {load,root}=require('./paymongo-test-env.cjs');
const {client,ref}=require('../docs/phase9-migration020/connection.cjs');
const fields=['slug','brand','model_name','display_name','engine_cc','description','generation','exact_model_name','model_year','transmission','fuel_tank_capacity_liters','cooling_system','starting_system','braking_system','category','notable_features','specification_status','specification_note','specification_source_url','daily_rate_php','is_published','archived_at'];
async function main(){
 const target=load();const original=parseEnv(fs.readFileSync(path.join(root,'.env.local'),'utf8'));
 if(ref!=='uuxjymzrtncrnnkvdpjy'||original.NEXT_PUBLIC_SUPABASE_URL!=='https://slevojynuumrvgiznmxk.supabase.co')throw Error('Catalog source/target verification failed');
 const publicKey=original.NEXT_PUBLIC_SUPABASE_ANON_KEY||original.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 async function publicRows(table,query){
  const r=await fetch(`${original.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?${query}`,{headers:{apikey:publicKey,Authorization:`Bearer ${publicKey}`},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(`Public ${table} read failed (${r.status})`);
  return r.json();
 }
 // Production is read through anon public RLS only; no customers, units or private buckets.
 const models=await publicRows('motorcycle_models',`select=id,${fields.join(',')}&is_published=eq.true&archived_at=is.null&order=daily_rate_php.asc`);
 if(!models.length)throw Error('Original public catalog is empty');
 const media=await publicRows('motorcycle_media','select=id,motorcycle_model_id,storage_path,alt_text,sort_order,media_kind,license_status,license_source_url,license_note,verification_status,is_primary&verification_status=eq.verified&license_status=in.(business_owned,licensed,permission_granted)&license_source_url=not.is.null&license_note=not.is.null');
 const allowed=new Set(models.map(m=>m.id));const approved=media.filter(m=>allowed.has(m.motorcycle_model_id));
 const storage=createClient(target.NEXT_PUBLIC_SUPABASE_URL,target.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const copied=[];
 for(const image of approved){
  const safePath=image.storage_path.split('/').map(encodeURIComponent).join('/');
  const r=await fetch(`${original.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/motorcycle-catalog/${safePath}`,{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('Original public catalog image unavailable');
  const bytes=Buffer.from(await r.arrayBuffer());const mime=r.headers.get('content-type')?.split(';')[0];
  if(!['image/jpeg','image/png','image/webp','image/avif'].includes(mime)||bytes.length>8388608)throw Error('Catalog image format/size rejected');
  const destination=`main-public-sync/${image.motorcycle_model_id}/${image.id}.${{ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'}[mime]}`;
  const upload=await storage.storage.from('motorcycle-catalog').upload(destination,bytes,{contentType:mime,upsert:true});
  if(upload.error)throw Error('TEST public image upload failed');
  copied.push({...image,storage_path:destination});
 }
 const db=client();const mapping=new Map();
 try{await db.connect();await db.query('begin');await db.query("set local lock_timeout='10s';set local statement_timeout='30s'");
  for(const model of models){
   const values=[model.id,...fields.map(f=>f==='notable_features'?JSON.stringify(model[f]):model[f])];
   const r=await db.query(`insert into public.motorcycle_models(id,${fields.join(',')}) values(${values.map((_,i)=>'$'+(i+1)).join(',')}) on conflict(slug) do update set ${fields.map(f=>`${f}=excluded.${f}`).join(',')} returning id`,values);
   mapping.set(model.id,r.rows[0].id);
  }
  for(const image of copied){
   const columns=Object.keys(image);const values=columns.map(k=>k==='motorcycle_model_id'?mapping.get(image[k]):image[k]);
   if(image.is_primary)await db.query('update public.motorcycle_media set is_primary=false where motorcycle_model_id=$1 and id<>$2',[mapping.get(image.motorcycle_model_id),image.id]);
   await db.query(`insert into public.motorcycle_media(${columns.join(',')}) values(${values.map((_,i)=>'$'+(i+1)).join(',')}) on conflict(id) do update set ${columns.filter(k=>k!=='id').map(k=>`${k}=excluded.${k}`).join(',')}`,values);
  }
  await db.query('commit');
 }catch(e){await db.query('rollback').catch(()=>{});throw e;}finally{await db.end();}
 fs.writeFileSync(path.join(root,'src/lib/constants/test-public-catalog.json'),JSON.stringify(models.map(m=>m.slug),null,2)+'\n');
 console.log(JSON.stringify({source:'original public catalog (anon read-only)',target:'dedicated TEST',models:models.map(m=>({slug:m.slug,name:m.display_name,dailyRatePHP:m.daily_rate_php})),copiedPublicImages:copied.length,syntheticFixtures:'retained unchanged',privateDataCopied:false}));
}
main().catch(e=>{console.error(e.code?`Catalog sync failed (${e.code})`:e.message);process.exitCode=1;});
