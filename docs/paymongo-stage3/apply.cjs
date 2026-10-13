/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS staging-only verification harness. */
// Dedicated TEST only. Never derive the target from application .env files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { client, ref } = require('../phase9-migration020/connection.cjs');
const versions = ['202610130024','202610130025'];
const report = { dedicatedTestVerified: ref === 'uuxjymzrtncrnnkvdpjy', productionContacted: false, applied: [], skipped: [] };
async function counts(c) {
 return (await c.query("select 'customers' entity,count(*)::int n from public.customers union all select 'bookings',count(*)::int from public.bookings union all select 'payment_events',count(*)::int from public.payment_events order by entity")).rows;
}
(async()=>{
 const c=client();
 try {
  if (!report.dedicatedTestVerified) throw Error('Unverified target');
  await c.connect();
  await c.query('begin');
  await c.query("set local lock_timeout='10s';set local statement_timeout='30s'");
  await c.query("select pg_advisory_xact_lock(hashtextextended('kjm-paymongo-test-migrations',0))");
  const history=(await c.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(r=>r.version);
  for (const required of ['202610110020','202610110021','202610110022','202610120023']) if(!history.includes(required)) throw Error('Dependency missing: '+required);
  report.before=await counts(c);
  for(const version of versions) {
   if(history.includes(version)){report.skipped.push(version);continue;}
   const file=fs.readdirSync(path.join(__dirname,'../../supabase/migrations')).find(f=>f.startsWith(version+'_'));
   const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations',file),'utf8');
   // Keep both migrations and their history in this single transaction.
   await c.query(sql.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,''));
   await c.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,file.slice(version.length+1,-4),[sql]]);
   report.applied.push({file,sha256:crypto.createHash('sha256').update(sql).digest('hex')});
  }
  report.after=await counts(c);
  if(JSON.stringify(report.before)!==JSON.stringify(report.after)) throw Error('Existing record counts changed');
  report.settings=(await c.query('select * from public.paymongo_test_settings')).rows;
  if(report.settings.some(r=>r.enabled)) throw Error('Payments must remain disabled');
  await c.query('commit');
  report.committed=true;
  fs.writeFileSync(path.join(__dirname,'deployment.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
 } catch(e) { await c.query('rollback').catch(()=>{});console.log(JSON.stringify({failed:true,code:e.code||null,message:e.code?undefined:e.message}));process.exitCode=1; }
 finally { await c.end(); }
})();
