-- Owner requested NEW notification events only for the 2026-11-06 launch.
-- Retains pending history and existing channel/event/reminder preferences.
-- Run once before enabling the production scheduler. This starts a new boundary.
begin;
do $$
begin
  if exists (
    select 1 from public.notification_outbox
    where status = 'processing' and lease_until > now()
  ) then
    raise exception 'An active notification delivery must finish before cutover';
  end if;
end;
$$;
update public.notification_settings
set delivery_start_at = now(), updated_at = now()
where id
returning delivery_start_at, telegram_enabled, resend_enabled, reminders_approved;
commit;
