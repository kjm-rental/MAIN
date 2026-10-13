-- Restricted developer booking mode using explicitly authorized Supabase Auth users.
-- Public booking remains independently disabled.

alter table public.booking_settings
  add column if not exists developer_testing_enabled boolean not null default false;
alter table public.customers add column if not exists is_test boolean not null default false;
alter table public.bookings add column if not exists is_test boolean not null default false;
alter table public.verification_documents add column if not exists is_test boolean not null default false;
alter table public.booking_settings
  add constraint booking_settings_public_or_developer_not_both
  check (not (public_booking_enabled and developer_testing_enabled));

-- Entering restricted developer-testing mode must never open public booking.
update public.booking_settings set public_booking_enabled = false where id = true;

create table public.booking_testers (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  authorized_by uuid not null references auth.users(id) on delete restrict,
  authorized_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > authorized_at)
);

alter table public.booking_testers enable row level security;
alter table public.booking_testers force row level security;
revoke all on public.booking_testers from anon, authenticated;

create or replace function private.is_active_booking_tester(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and exists (
      select 1
      from public.booking_testers tester
      where tester.auth_user_id = p_user
        and tester.revoked_at is null
        and tester.expires_at > now()
    );
$$;
revoke all on function private.is_active_booking_tester(uuid) from public, anon, authenticated;

create or replace function public.can_use_developer_booking()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select developer_testing_enabled from public.booking_settings where id = true),
    false
  ) and private.is_active_booking_tester(auth.uid());
$$;
revoke all on function public.can_use_developer_booking() from public, anon;
grant execute on function public.can_use_developer_booking() to authenticated;

create or replace function public.admin_set_developer_booking_tester(
  p_auth_user_id uuid,
  p_expires_at timestamptz,
  p_authorized boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_auth_user_id = auth.uid() then
    raise exception 'Use a dedicated non-administrator tester account';
  end if;

  if p_authorized then
    if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
      raise exception 'Tester authorization expiry must be within thirty days';
    end if;
    if exists (
      select 1 from public.admin_users admin_user
      where admin_user.auth_user_id = p_auth_user_id and admin_user.is_active
    ) then
      raise exception 'Administrator accounts cannot be developer tester accounts';
    end if;
    if exists (
      select 1 from public.customers customer
      where customer.auth_user_id = p_auth_user_id and not customer.is_test
    ) then
      raise exception 'Use a dedicated account with no production customer record';
    end if;
    insert into public.booking_testers(auth_user_id, authorized_by, expires_at, revoked_at)
    values(p_auth_user_id, auth.uid(), p_expires_at, null)
    on conflict(auth_user_id) do update
      set authorized_by = excluded.authorized_by,
          authorized_at = now(),
          expires_at = excluded.expires_at,
          revoked_at = null;
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values(auth.uid(), 'developer_booking_tester.authorized', 'auth_user', p_auth_user_id,
      jsonb_build_object('expires_at', p_expires_at));
  else
    update public.booking_testers
      set revoked_at = coalesce(revoked_at, now())
      where auth_user_id = p_auth_user_id;
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id)
    values(auth.uid(), 'developer_booking_tester.revoked', 'auth_user', p_auth_user_id);
  end if;
end;
$$;
revoke all on function public.admin_set_developer_booking_tester(uuid, timestamptz, boolean) from public, anon;
grant execute on function public.admin_set_developer_booking_tester(uuid, timestamptz, boolean) to authenticated;

create or replace function private.calculate_booking_quote(
  p_model_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_require_public_enabled boolean
)
returns table (pricing_units integer, daily_rate_php integer, total_php integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.booking_settings%rowtype;
  v_rate integer;
  v_seconds bigint;
  v_units integer;
  v_total integer;
  v_start_local timestamp := p_start_at at time zone 'Asia/Manila';
  v_end_local timestamp := p_end_at at time zone 'Asia/Manila';
begin
  select * into v_settings from public.booking_settings where id = true;
  if p_require_public_enabled and not (
    (v_settings.public_booking_enabled and v_settings.policies_approved_at is not null)
    or (v_settings.developer_testing_enabled and private.is_active_booking_tester(auth.uid()))
  ) then
    raise exception 'Online booking is not enabled for this session';
  end if;
  perform private.assert_booking_period_allowed(p_start_at, p_end_at, v_settings.operating_hours);
  select model.daily_rate_php into v_rate
  from public.motorcycle_models model
  where model.id = p_model_id and model.is_published and model.archived_at is null;
  if v_rate is null then raise exception 'Motorcycle is unavailable'; end if;
  v_seconds := extract(epoch from (p_end_at - p_start_at))::bigint;
  if v_settings.partial_day_policy = 'started_24_hours' then
    if v_settings.partial_day_pricing_policy = 'not_allowed' and mod(v_seconds, 86400) <> 0 then
      raise exception 'Partial rental days are not allowed';
    end if;
    v_units := greatest(1, ceil(v_seconds::numeric / 86400)::integer);
    if v_settings.partial_day_pricing_policy = 'prorated' then
      v_total := ceil(v_rate::numeric * v_seconds / 86400)::integer;
    else
      v_total := v_rate * v_units;
    end if;
  elsif v_settings.partial_day_policy = 'calendar_day' then
    if v_settings.partial_day_pricing_policy = 'prorated' then
      raise exception 'Prorated calendar-day pricing requires an approved calculation rule';
    end if;
    if v_settings.partial_day_pricing_policy = 'not_allowed' and v_start_local::time <> v_end_local::time then
      raise exception 'Partial calendar days are not allowed';
    end if;
    v_units := case when v_settings.partial_day_pricing_policy = 'not_allowed'
      then greatest(1, v_end_local::date - v_start_local::date)
      else greatest(1, v_end_local::date - v_start_local::date + 1) end;
    v_total := v_rate * v_units;
  else
    raise exception 'Rental-day calculation is not configured';
  end if;
  return query select v_units, v_rate, v_total;
end;
$$;
revoke all on function private.calculate_booking_quote(uuid, timestamptz, timestamptz, boolean)
  from public, anon, authenticated;

create or replace function private.label_developer_customer_or_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_active_booking_tester(auth.uid()) then
    new.is_test := true;
  elsif tg_op = 'UPDATE' then
    new.is_test := old.is_test;
  end if;
  return new;
end;
$$;
revoke all on function private.label_developer_customer_or_booking() from public, anon, authenticated;

create or replace function private.label_developer_verification_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Derive this from the booking rather than the current tester grant. A
  -- document remains synthetic even if it is uploaded after authorization
  -- expires, and clients cannot remove the marker themselves.
  select booking.is_test into new.is_test
  from public.bookings booking
  where booking.id = new.booking_id;
  if not found then
    raise exception 'Booking does not exist';
  end if;
  return new;
end;
$$;
revoke all on function private.label_developer_verification_document() from public, anon, authenticated;

create trigger customers_label_developer_test
before insert or update on public.customers
for each row execute function private.label_developer_customer_or_booking();
create trigger bookings_label_developer_test
before insert or update on public.bookings
for each row execute function private.label_developer_customer_or_booking();
create trigger verification_documents_label_developer_test
before insert or update on public.verification_documents
for each row execute function private.label_developer_verification_document();

grant select (developer_testing_enabled) on public.booking_settings to authenticated;
comment on table public.booking_testers is
  'Expiring developer booking authorization assigned only by active administrators; never an administrator grant.';
comment on column public.booking_settings.developer_testing_enabled is
  'Allows only explicitly authorized, unexpired, non-anonymous tester accounts while public booking remains disabled.';
