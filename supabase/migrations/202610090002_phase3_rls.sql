-- KJM Motorcycle Rental — Phase 3 least-privilege RLS and grants

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where auth_user_id = (select auth.uid())
      and is_active = true
  );
$$;

revoke all on function private.is_active_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_active_admin() to authenticated;

alter table public.motorcycle_models enable row level security;
alter table public.motorcycle_units enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.motorcycle_unavailability enable row level security;
alter table public.motorcycle_media enable row level security;
alter table public.admin_users enable row level security;
alter table public.audit_logs enable row level security;
alter table public.payments enable row level security;

alter table public.motorcycle_models force row level security;
alter table public.motorcycle_units force row level security;
alter table public.customers force row level security;
alter table public.bookings force row level security;
alter table public.booking_status_history force row level security;
alter table public.pricing_rules force row level security;
alter table public.motorcycle_unavailability force row level security;
alter table public.motorcycle_media force row level security;
alter table public.admin_users force row level security;
alter table public.audit_logs force row level security;
alter table public.payments force row level security;

revoke all on public.motorcycle_models, public.motorcycle_units, public.customers,
  public.bookings, public.booking_status_history, public.pricing_rules,
  public.motorcycle_unavailability, public.motorcycle_media, public.admin_users,
  public.audit_logs, public.payments from anon, authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.prevent_booking_during_unavailability() from public, anon, authenticated;
revoke execute on function public.prevent_unavailability_during_booking() from public, anon, authenticated;

grant select (id, slug, brand, model_name, display_name, engine_cc, description, daily_rate_php, is_published)
on public.motorcycle_models to anon, authenticated;
grant select (id, motorcycle_model_id, storage_path, alt_text, sort_order)
on public.motorcycle_media to anon, authenticated;

create policy motorcycle_models_public_read
on public.motorcycle_models for select to anon, authenticated
using (is_published = true);

create policy motorcycle_media_public_read
on public.motorcycle_media for select to anon, authenticated
using (exists (
  select 1 from public.motorcycle_models model
  where model.id = motorcycle_model_id and model.is_published = true
));

-- Authenticated users receive table privileges only where an active, trusted
-- admin policy also permits the operation. Ordinary accounts remain denied.
grant select, insert, update, delete on public.motorcycle_models to authenticated;
grant select, insert, update, delete on public.motorcycle_units to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.bookings to authenticated;
grant select, insert on public.booking_status_history to authenticated;
grant select, insert, update, delete on public.pricing_rules to authenticated;
grant select, insert, update, delete on public.motorcycle_unavailability to authenticated;
grant select, insert, update, delete on public.motorcycle_media to authenticated;
grant select on public.admin_users to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.payments to authenticated;

create policy motorcycle_models_admin_all on public.motorcycle_models
for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create policy motorcycle_units_admin_all on public.motorcycle_units
for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create policy customers_admin_all on public.customers
for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create policy bookings_admin_all on public.bookings
for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create policy booking_status_history_admin_read on public.booking_status_history
for select to authenticated using ((select private.is_active_admin()));
create policy booking_status_history_admin_insert on public.booking_status_history
for insert to authenticated with check ((select private.is_active_admin()));
create policy pricing_rules_admin_all on public.pricing_rules
for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create policy motorcycle_unavailability_admin_all on public.motorcycle_unavailability
for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create policy motorcycle_media_admin_all on public.motorcycle_media
for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create policy admin_users_admin_read on public.admin_users
for select to authenticated using ((select private.is_active_admin()));
create policy audit_logs_admin_read on public.audit_logs
for select to authenticated using ((select private.is_active_admin()));
create policy payments_admin_read on public.payments
for select to authenticated using ((select private.is_active_admin()));

comment on function private.is_active_admin() is 'Trusted lookup of server-managed admin membership. No client can insert or update admin_users through RLS.';
