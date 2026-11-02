-- Operator-authorized activation after the 2026-11-02 verification run.
-- Evidence: owner-paid PHP10 provider/webhook check; 27 staging SQL/source
-- integration checks; 186 matching production/staging payment schema entries.
-- Provider transport in the booking integration tests was simulated. No claim
-- is made that a real rental payment was collected during those tests.
begin;
set local lock_timeout='5s';
set local statement_timeout='20s';
select pg_advisory_xact_lock(hashtextextended('kjm-verified-qrph-activation',0));
do $$ begin
  if not exists(select 1 from public.paymongo_live_settings where id and migration_verified and webhook_verified)
    then raise exception 'Migration and authentic webhook verification are required';end if;
  if not exists(select 1 from public.delivery_settings where id)
    then raise exception 'Payment-method settings missing';end if;
  if (select md5(prosrc) from pg_proc where oid='public.settle_paymongo_live_checkout(text,text,bigint,text,boolean)'::regprocedure)
     is distinct from 'd7afbd8f13e073a88631a52ef1bf1959'
    then raise exception 'Settlement source changed after verification';end if;
  if (select md5(prosrc) from pg_proc where oid='public.prepare_paymongo_guest_checkout(uuid,text,uuid)'::regprocedure)
     is distinct from '22bbae67f5db1df79cbb27b7ea3f8b16'
    then raise exception 'Guest payment source changed after verification';end if;
end $$;
update public.paymongo_live_settings
set reconciliation_verified=true,concurrency_verified=true,enabled=true where id;
update public.delivery_settings set qrph_enabled=true where id;
insert into public.audit_logs(action,entity_type,metadata)
values('paymongo.live_qrph_enabled','payment_settings',jsonb_build_object(
  'verification_date','2026-11-02','staging_checks',27,'matching_schema_entries',186,
  'live_verification_php',10,'booking_provider_transport','simulated_in_staging',
  'real_rental_payment_collected_during_verification',false));
do $$ begin
  if public.paymongo_live_ready() is distinct from true then raise exception 'Live foundation failed readiness';end if;
end $$;
commit;
select public.paymongo_live_ready() as live_ready,public.get_delivery_options()->>'qrph_enabled' as qrph_enabled;
