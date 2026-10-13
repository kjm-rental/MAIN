-- KJM Motorcycle Rental — Phase 3 core schema
-- Canonical migration owner: KJM MAIN

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

set search_path = public, extensions;

create table public.motorcycle_models (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  brand text not null check (length(trim(brand)) > 0),
  model_name text not null check (length(trim(model_name)) > 0),
  display_name text not null check (length(trim(display_name)) > 0),
  engine_cc integer check (engine_cc is null or engine_cc > 0),
  description text,
  daily_rate_php integer not null check (daily_rate_php >= 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.motorcycle_units (
  id uuid primary key default gen_random_uuid(),
  motorcycle_model_id uuid not null references public.motorcycle_models(id) on delete restrict,
  internal_unit_code text not null unique check (length(trim(internal_unit_code)) > 0),
  registration_plate text unique,
  status text not null default 'inactive' check (status in ('available', 'reserved', 'rented', 'maintenance', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null check (length(trim(full_name)) > 0),
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique check (length(trim(booking_reference)) > 0),
  customer_id uuid not null references public.customers(id) on delete restrict,
  motorcycle_unit_id uuid not null references public.motorcycle_units(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'pending', 'confirmed', 'active', 'completed', 'cancelled', 'expired')),
  quoted_total_php integer not null check (quoted_total_php >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_valid_period check (end_at > start_at),
  constraint bookings_no_active_overlap exclude using gist (
    motorcycle_unit_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('pending', 'confirmed', 'active'))
);

create table public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint booking_status_history_old_status_check check (old_status is null or old_status in ('draft', 'pending', 'confirmed', 'active', 'completed', 'cancelled', 'expired')),
  constraint booking_status_history_new_status_not_blank check (length(trim(new_status)) > 0),
  constraint booking_status_history_new_status_allowed_check check (new_status in ('draft', 'pending', 'confirmed', 'active', 'completed', 'cancelled', 'expired'))
);

create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  motorcycle_model_id uuid not null references public.motorcycle_models(id) on delete cascade,
  rule_name text not null check (length(trim(rule_name)) > 0),
  pricing_type text not null check (length(trim(pricing_type)) > 0),
  amount_php integer not null check (amount_php >= 0),
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default false,
  constraint pricing_rules_valid_period check (valid_until is null or valid_from is null or valid_until > valid_from)
);

create table public.motorcycle_unavailability (
  id uuid primary key default gen_random_uuid(),
  motorcycle_unit_id uuid not null references public.motorcycle_units(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now(),
  constraint motorcycle_unavailability_valid_period check (end_at > start_at),
  constraint motorcycle_unavailability_no_overlap exclude using gist (
    motorcycle_unit_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
);

create table public.motorcycle_media (
  id uuid primary key default gen_random_uuid(),
  motorcycle_model_id uuid not null references public.motorcycle_models(id) on delete cascade,
  storage_path text not null unique check (length(trim(storage_path)) > 0),
  alt_text text not null check (length(trim(alt_text)) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (length(trim(role)) > 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (length(trim(action)) > 0),
  entity_type text not null check (length(trim(entity_type)) > 0),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  payment_provider text not null check (length(trim(payment_provider)) > 0),
  provider_reference text,
  amount_php integer not null check (amount_php >= 0),
  status text not null default 'pending' check (status in ('pending', 'authorized', 'paid', 'failed', 'refunded', 'cancelled')),
  created_at timestamptz not null default now()
);

create index motorcycle_units_model_idx on public.motorcycle_units(motorcycle_model_id);
create index motorcycle_units_status_idx on public.motorcycle_units(status);
create index customers_email_idx on public.customers(lower(email)) where email is not null;
create index bookings_customer_idx on public.bookings(customer_id);
create index bookings_unit_start_idx on public.bookings(motorcycle_unit_id, start_at);
create index bookings_status_idx on public.bookings(status);
create index booking_status_history_booking_created_idx on public.booking_status_history(booking_id, created_at desc);
create index pricing_rules_model_active_idx on public.pricing_rules(motorcycle_model_id, is_active);
create index motorcycle_media_model_sort_idx on public.motorcycle_media(motorcycle_model_id, sort_order);
create index audit_logs_actor_created_idx on public.audit_logs(actor_user_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);
create index payments_booking_idx on public.payments(booking_id);
create unique index payments_provider_reference_unique_idx
on public.payments(payment_provider, provider_reference)
where provider_reference is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger motorcycle_models_set_updated_at before update on public.motorcycle_models
for each row execute function public.set_updated_at();
create trigger motorcycle_units_set_updated_at before update on public.motorcycle_units
for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings
for each row execute function public.set_updated_at();

-- A transaction-scoped advisory lock closes the cross-table race between a
-- booking and a maintenance/manual block for the same physical unit.
create or replace function public.prevent_booking_during_unavailability()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status in ('pending', 'confirmed', 'active') then
    perform pg_advisory_xact_lock(hashtextextended(new.motorcycle_unit_id::text, 0));
    if exists (
      select 1 from public.motorcycle_unavailability u
      where u.motorcycle_unit_id = new.motorcycle_unit_id
        and tstzrange(u.start_at, u.end_at, '[)') && tstzrange(new.start_at, new.end_at, '[)')
    ) then
      raise exception 'motorcycle unit is unavailable during the requested period' using errcode = '23P01';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_unavailability_during_booking()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.motorcycle_unit_id::text, 0));
  if exists (
    select 1 from public.bookings b
    where b.motorcycle_unit_id = new.motorcycle_unit_id
      and b.status in ('pending', 'confirmed', 'active')
      and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(new.start_at, new.end_at, '[)')
  ) then
    raise exception 'motorcycle unit has an active booking during the blocked period' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger bookings_check_unavailability
before insert or update of motorcycle_unit_id, start_at, end_at, status on public.bookings
for each row execute function public.prevent_booking_during_unavailability();

create trigger unavailability_check_bookings
before insert or update of motorcycle_unit_id, start_at, end_at on public.motorcycle_unavailability
for each row execute function public.prevent_unavailability_during_booking();

comment on column public.motorcycle_units.registration_plate is 'Private operational identifier; never expose through public catalog APIs.';
comment on table public.payments is 'Schema foundation only. No live provider integration exists in Phase 3.';
comment on table public.audit_logs is 'Private append-oriented security and operational audit trail.';
