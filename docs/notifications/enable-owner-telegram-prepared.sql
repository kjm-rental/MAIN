-- PREPARED FOR APPROVAL ONLY; not applied.
-- First review diagnose-booking-notifications.sql. Do not replay already-sent/ambiguous messages.
-- Does not alter booking status, customer details, recipient binding, or delivery history.
begin;
do $$ begin
 if to_regprocedure('public.notification_runtime_status()') is null then raise exception '031 must already be installed'; end if;
end $$;
update public.notification_settings set telegram_enabled=true,updated_at=now()
where id and delivery_start_at is not null;
commit;
-- The existing local owner worker is configured; its database switch is enabled by this transaction.
