-- Run only against a disposable local Supabase database after migrations.
-- The transaction always rolls back all test records.

begin;

do $$
declare
  model_count integer;
  duplicate_slugs integer;
begin
  select count(*) into model_count from public.motorcycle_models;
  if model_count <> 10 then raise exception 'expected 10 seeded models, found %', model_count; end if;

  select count(*) - count(distinct slug) into duplicate_slugs from public.motorcycle_models;
  if duplicate_slugs <> 0 then raise exception 'duplicate model slugs found'; end if;

  if not exists (select 1 from public.motorcycle_models where display_name = 'Honda Beat' and daily_rate_php = 499)
    or not exists (select 1 from public.motorcycle_models where display_name = 'Honda ADV 350' and daily_rate_php = 1800)
  then raise exception 'seed price verification failed'; end if;
end $$;

do $$
declare
  model_id uuid;
  unit_id uuid;
  customer_id uuid;
begin
  select id into model_id from public.motorcycle_models where slug = 'honda-beat';
  insert into public.motorcycle_units (motorcycle_model_id, internal_unit_code, status)
  values (model_id, 'PHASE3-TEST-UNIT', 'available') returning id into unit_id;
  insert into public.customers (full_name) values ('Phase 3 Transaction Test') returning id into customer_id;

  insert into public.bookings (booking_reference, customer_id, motorcycle_unit_id, start_at, end_at, status, quoted_total_php)
  values ('PHASE3-TEST-001', customer_id, unit_id, '2030-01-01 08:00+08', '2030-01-03 08:00+08', 'confirmed', 998);

  begin
    insert into public.bookings (booking_reference, customer_id, motorcycle_unit_id, start_at, end_at, status, quoted_total_php)
    values ('PHASE3-TEST-002', customer_id, unit_id, '2030-01-02 08:00+08', '2030-01-04 08:00+08', 'pending', 998);
    raise exception 'overlapping active booking was incorrectly accepted';
  exception when exclusion_violation then null;
  end;

  insert into public.bookings (booking_reference, customer_id, motorcycle_unit_id, start_at, end_at, status, quoted_total_php)
  values ('PHASE3-TEST-003', customer_id, unit_id, '2030-01-02 08:00+08', '2030-01-04 08:00+08', 'cancelled', 998);

  begin
    insert into public.motorcycle_unavailability (motorcycle_unit_id, start_at, end_at, reason)
    values (unit_id, '2030-01-02 08:00+08', '2030-01-02 12:00+08', 'Phase 3 test block');
    raise exception 'maintenance overlap was incorrectly accepted';
  exception when exclusion_violation then null;
  end;
end $$;

do $$
begin
  if has_table_privilege('anon', 'public.customers', 'select') then raise exception 'anon can select customers'; end if;
  if has_table_privilege('anon', 'public.bookings', 'select') then raise exception 'anon can select bookings'; end if;
  if has_table_privilege('anon', 'public.motorcycle_units', 'select') then raise exception 'anon can select motorcycle units'; end if;
  if has_table_privilege('anon', 'public.payments', 'select') then raise exception 'anon can select payments'; end if;
  if not has_column_privilege('anon', 'public.motorcycle_models', 'display_name', 'select') then raise exception 'anon cannot read safe catalog columns'; end if;
end $$;

rollback;
