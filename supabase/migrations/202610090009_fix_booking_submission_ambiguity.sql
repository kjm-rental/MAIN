-- Phase 5 hotfix: disambiguate the customer verification upsert.
-- The table-returning function has an output parameter named booking_id, so a
-- column-list conflict target with the same identifier is ambiguous in PL/pgSQL.

create or replace function public.submit_booking_request(
  p_idempotency_key uuid, p_model_id uuid, p_start_at timestamptz, p_end_at timestamptz,
  p_full_name text, p_email text, p_phone text, p_country text, p_customer_type text,
  p_identity_name text, p_license_name text, p_license_country text,
  p_license_expiration date, p_vehicle_categories text, p_entry_date date,
  p_privacy_consent boolean, p_declaration boolean
) returns table (booking_id uuid, booking_reference text, verification_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_model public.motorcycle_models%rowtype;
  v_customer_id uuid;
  v_booking_id uuid;
  v_verification_id uuid;
  v_reference text;
  v_policy text;
  v_units integer;
  v_available integer;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if not p_privacy_consent or not p_declaration then
    raise exception 'Required declarations are missing';
  end if;
  if p_start_at <= now() or p_end_at <= p_start_at then
    raise exception 'Invalid rental period';
  end if;

  select partial_day_policy
  into v_policy
  from public.booking_settings
  where id = true;

  if v_policy is null then
    raise exception 'Booking pricing policy is not configured';
  end if;

  select *
  into v_model
  from public.motorcycle_models
  where id = p_model_id
    and is_published
    and archived_at is null;

  if not found then
    raise exception 'Motorcycle is unavailable';
  end if;

  if v_policy = 'started_24_hours' then
    v_units := greatest(1, ceil(extract(epoch from (p_end_at - p_start_at)) / 86400)::integer);
  else
    v_units := greatest(
      1,
      (p_end_at at time zone 'Asia/Manila')::date
        - (p_start_at at time zone 'Asia/Manila')::date
        + 1
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_model_id::text, 0));

  select count(*)
  into v_available
  from public.motorcycle_units u
  where u.motorcycle_model_id = p_model_id
    and u.status = 'available'
    and u.archived_at is null
    and not exists (
      select 1
      from public.bookings b
      where b.motorcycle_unit_id = u.id
        and b.status in ('pending', 'confirmed', 'active')
        and tstzrange(b.start_at, b.end_at, '[)')
          && tstzrange(p_start_at, p_end_at, '[)')
    )
    and not exists (
      select 1
      from public.motorcycle_unavailability x
      where x.motorcycle_unit_id = u.id
        and tstzrange(x.start_at, x.end_at, '[)')
          && tstzrange(p_start_at, p_end_at, '[)')
    );

  if v_available = 0 then
    raise exception 'No verified physical unit is available';
  end if;

  insert into public.customers (
    auth_user_id, full_name, email, phone, country_of_residence, customer_type
  ) values (
    v_user, trim(p_full_name), lower(trim(p_email)), trim(p_phone), trim(p_country), p_customer_type
  )
  on conflict (auth_user_id) do update
  set full_name = excluded.full_name,
      email = excluded.email,
      phone = excluded.phone,
      country_of_residence = excluded.country_of_residence,
      customer_type = excluded.customer_type,
      updated_at = now()
  returning id into v_customer_id;

  v_reference := 'KJM-'
    || to_char(now() at time zone 'Asia/Manila', 'YYYYMMDD')
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.bookings (
    booking_reference, customer_id, motorcycle_model_id, start_at, end_at,
    status, quoted_total_php, pricing_daily_rate_php, pricing_units,
    submitted_at, idempotency_key
  ) values (
    v_reference, v_customer_id, p_model_id, p_start_at, p_end_at,
    'submitted', v_model.daily_rate_php * v_units, v_model.daily_rate_php,
    v_units, now(), p_idempotency_key
  )
  on conflict (idempotency_key) do update
  set idempotency_key = excluded.idempotency_key
  returning id, public.bookings.booking_reference
  into v_booking_id, v_reference;

  insert into public.customer_verifications (
    booking_id, customer_id, customer_type, identity_status, license_status,
    entitlement_status, international_status, overall_status,
    license_issuing_country, license_expiration_date,
    permitted_vehicle_categories, philippines_entry_date, identity_name,
    license_name, customer_declaration_at, privacy_consent_at
  ) values (
    v_booking_id, v_customer_id, p_customer_type, 'submitted', 'submitted',
    'under_review',
    case
      when p_customer_type = 'international_visitor' then 'under_review'
      else 'not_applicable'
    end,
    'submitted', p_license_country, p_license_expiration,
    p_vehicle_categories, p_entry_date, trim(p_identity_name),
    trim(p_license_name), now(), now()
  )
  on conflict on constraint customer_verifications_booking_id_key do update
  set booking_id = excluded.booking_id
  returning id into v_verification_id;

  insert into public.booking_status_history (
    booking_id, old_status, new_status, changed_by
  ) values (
    v_booking_id, null, 'submitted', v_user
  ) on conflict do nothing;

  insert into public.notification_events (booking_id, event_type)
  values (v_booking_id, 'booking_request_created');

  return query
  select v_booking_id, v_reference, v_verification_id;
end;
$$;

revoke all on function public.submit_booking_request(
  uuid, uuid, timestamptz, timestamptz, text, text, text, text, text,
  text, text, text, date, text, date, boolean, boolean
) from public, anon;

grant execute on function public.submit_booking_request(
  uuid, uuid, timestamptz, timestamptz, text, text, text, text, text,
  text, text, text, date, text, date, boolean, boolean
) to authenticated;
