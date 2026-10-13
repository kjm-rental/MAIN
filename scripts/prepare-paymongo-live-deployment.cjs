/* eslint-disable @typescript-eslint/no-require-imports -- Offline SQL bundle preparation only. */
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/202610130026_paymongo_live_booking_payments.sql'),'utf8');
const evidence=JSON.parse(fs.readFileSync(path.join(root,'docs/paymongo-live-verification/results.json'),'utf8'));
if(!evidence.passed||createHash('sha256').update(sql).digest('hex')!==evidence.migrationSHA256)throw Error('Staging-tested migration hash does not match');
const body=sql.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
const bundle=`-- PREPARED ONLY: requires separate production approval, verified backup and all readiness blockers resolved.
-- This generator never connects to any database. Apply once with psql ON_ERROR_STOP.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(hashtextextended('kjm-paymongo-live-migration026',0));
do $$ begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='202610130026')
 or to_regclass('public.paymongo_live_checkouts') is not null then raise exception '026 already/partially present; investigate instead of rerunning'; end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='202610120023') then raise exception 'Dependency 023 missing'; end if;
end; $$;
${body}
insert into supabase_migrations.schema_migrations(version,name,statements)
values('202610130026','paymongo_live_booking_payments',array[$migration026$${sql}$migration026$]);
do $$ begin
 if public.paymongo_live_ready() then raise exception 'Live readiness must remain disabled'; end if;
end; $$;
commit;
`;
fs.writeFileSync(path.join(root,'docs/paymongo-live-verification/production-apply.sql'),bundle);
console.log('Prepared atomic SQL/history bundle offline. NOT applied. Production approval/readiness still required.');
