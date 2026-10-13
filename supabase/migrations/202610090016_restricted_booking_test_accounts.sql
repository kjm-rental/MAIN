-- Time-limited, administrator-authorized synthetic booking tests.
-- This does not alter the public-booking readiness trigger or public switch.

create table public.booking_test_authorizations (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  authorized_by uuid not null references auth.users(id) on delete restrict,
  authorized_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > authorized_at)
);
alter table public.booking_test_authorizations enable row level security;
alter table public.booking_test_authorizations force row level security;
revoke all on public.booking_test_authorizations from anon, authenticated;

create or replace function private.is_active_booking_tester(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select p_user is not null
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and exists (
      select 1 from public.booking_test_authorizations tester_authorization
      where tester_authorization.auth_user_id = p_user
        and tester_authorization.revoked_at is null
        and tester_authorization.expires_at > now()
    );
$$;
revoke all on function private.is_active_booking_tester(uuid) from public,anon,authenticated;

create or replace function public.can_use_booking_testing()
returns boolean language sql stable security definer set search_path='' as $$
  select private.is_active_booking_tester(auth.uid());
$$;
revoke all on function public.can_use_booking_testing() from public,anon;
grant execute on function public.can_use_booking_testing() to authenticated;

create or replace function public.admin_set_booking_tester(
  p_auth_user_id uuid,
  p_expires_at timestamptz,
  p_authorized boolean
) returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
  if p_auth_user_id = auth.uid() then raise exception 'Use a separate non-administrator test account'; end if;
  if p_authorized then
    if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
      raise exception 'Test authorization expiry must be within seven days';
    end if;
    if exists(select 1 from auth.users where id=p_auth_user_id and is_anonymous) then
      raise exception 'Anonymous accounts cannot be authorized testers';
    end if;
    if exists(select 1 from public.admin_users where auth_user_id=p_auth_user_id and is_active) then
      raise exception 'Administrator accounts cannot be booking testers';
    end if;
    if exists(select 1 from public.customers where auth_user_id=p_auth_user_id and not is_test) then
      raise exception 'Use a dedicated account with no production customer record';
    end if;
    insert into public.booking_test_authorizations(auth_user_id,authorized_by,expires_at,revoked_at)
    values(p_auth_user_id,auth.uid(),p_expires_at,null)
    on conflict(auth_user_id) do update set
      authorized_by=excluded.authorized_by,authorized_at=now(),
      expires_at=excluded.expires_at,revoked_at=null;
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),'booking_tester.authorized','auth_user',p_auth_user_id,jsonb_build_object('expires_at',p_expires_at));
  else
    update public.booking_test_authorizations set revoked_at=coalesce(revoked_at,now())
    where auth_user_id=p_auth_user_id;
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id)
    values(auth.uid(),'booking_tester.revoked','auth_user',p_auth_user_id);
  end if;
end; $$;
revoke all on function public.admin_set_booking_tester(uuid,timestamptz,boolean) from public,anon;
grant execute on function public.admin_set_booking_tester(uuid,timestamptz,boolean) to authenticated;

create or replace function private.calculate_booking_quote(
  p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_require_public_enabled boolean
) returns table (pricing_units integer,daily_rate_php integer,total_php integer)
language plpgsql stable security definer set search_path='' as $$
declare
  v_settings public.booking_settings%rowtype; v_rate integer; v_seconds bigint; v_units integer; v_total integer;
  v_start_local timestamp := p_start_at at time zone 'Asia/Manila';
  v_end_local timestamp := p_end_at at time zone 'Asia/Manila';
begin
  select * into v_settings from public.booking_settings where id=true;
  if p_require_public_enabled and not (
    (v_settings.public_booking_enabled and v_settings.policies_approved_at is not null)
    or private.is_active_booking_tester(auth.uid())
  ) then raise exception 'Online booking is not enabled for this session'; end if;
  perform private.assert_booking_period_allowed(p_start_at,p_end_at,v_settings.operating_hours);
  select m.daily_rate_php into v_rate from public.motorcycle_models m where m.id=p_model_id and m.is_published and m.archived_at is null;
  if v_rate is null then raise exception 'Motorcycle is unavailable'; end if;
  v_seconds := extract(epoch from (p_end_at-p_start_at))::bigint;
  if v_settings.partial_day_policy='started_24_hours' then
    if v_settings.partial_day_pricing_policy='not_allowed' and mod(v_seconds,86400)<>0 then raise exception 'Partial rental days are not allowed'; end if;
    v_units:=greatest(1,ceil(v_seconds::numeric/86400)::integer);
    if v_settings.partial_day_pricing_policy='prorated' then v_total:=ceil(v_rate::numeric*v_seconds/86400)::integer; else v_total:=v_rate*v_units; end if;
  elsif v_settings.partial_day_policy='calendar_day' then
    if v_settings.partial_day_pricing_policy='prorated' then raise exception 'Prorated calendar-day pricing requires an approved calculation rule'; end if;
    if v_settings.partial_day_pricing_policy='not_allowed' and v_start_local::time<>v_end_local::time then raise exception 'Partial calendar days are not allowed'; end if;
    v_units:=case when v_settings.partial_day_pricing_policy='not_allowed' then greatest(1,v_end_local::date-v_start_local::date) else greatest(1,v_end_local::date-v_start_local::date+1) end;
    v_total:=v_rate*v_units;
  else raise exception 'Rental-day calculation is not configured'; end if;
  return query select v_units,v_rate,v_total;
end; $$;
revoke all on function private.calculate_booking_quote(uuid,timestamptz,timestamptz,boolean) from public,anon,authenticated;

create or replace function private.label_booking_test_record()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if private.is_active_booking_tester(auth.uid()) then new.is_test:=true;
  elsif tg_op='UPDATE' then new.is_test:=old.is_test;
  end if;
  return new;
end; $$;
revoke all on function private.label_booking_test_record() from public,anon,authenticated;

create or replace function private.label_booking_test_document()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  select booking.is_test into new.is_test from public.bookings booking where booking.id=new.booking_id;
  if not found then raise exception 'Booking does not exist'; end if;
  return new;
end; $$;
revoke all on function private.label_booking_test_document() from public,anon,authenticated;

create trigger customers_label_booking_test before insert or update on public.customers
for each row execute function private.label_booking_test_record();
create trigger bookings_label_booking_test before insert or update on public.bookings
for each row execute function private.label_booking_test_record();
create trigger verification_documents_label_booking_test before insert or update on public.verification_documents
for each row execute function private.label_booking_test_document();

comment on table public.booking_test_authorizations is
  'Expiring synthetic-booking authorization assigned only by active administrators; grants no administrator role.';
