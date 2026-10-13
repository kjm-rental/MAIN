-- Remove the temporary developer-only booking path after migration 013.
-- Public booking remains off and can only be enabled through the existing
-- administrator-controlled readiness and policy approval gate.

update public.booking_settings
set public_booking_enabled = false
where id = true;

drop function if exists public.admin_set_developer_booking_tester(uuid, timestamptz, boolean);
drop function if exists public.can_use_developer_booking();

drop trigger if exists customers_label_developer_test on public.customers;
drop trigger if exists bookings_label_developer_test on public.bookings;
drop trigger if exists verification_documents_label_developer_test on public.verification_documents;
drop function if exists private.label_developer_customer_or_booking();
drop function if exists private.label_developer_verification_document();

-- Restore the normal public-booking gate from migration 011. Quotation,
-- availability, and submission remain server controlled.
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
  if p_require_public_enabled and (
    not v_settings.public_booking_enabled or v_settings.policies_approved_at is null
  ) then
    raise exception 'Online booking is not enabled';
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

-- New customer requests enter the pending state used by the administrator
-- workflow. Verification still starts unapproved and confirmation retains all
-- of migration 011's document, eligibility, availability, and overlap checks.
create or replace function public.submit_booking_request(
  p_idempotency_key uuid,p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,
  p_full_name text,p_email text,p_phone text,p_country text,p_customer_type text,
  p_identity_name text,p_license_name text,p_license_country text,p_license_expiration date,
  p_vehicle_categories text,p_entry_date date,p_privacy_consent boolean,p_declaration boolean
) returns table (booking_id uuid,booking_reference text,verification_id uuid)
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_settings public.booking_settings%rowtype; v_quote record;
  v_customer_id uuid; v_booking_id uuid; v_verification_id uuid; v_reference text; v_unit_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not p_privacy_consent or not p_declaration then raise exception 'Required declarations are missing'; end if;
  if p_start_at<=now() then raise exception 'Pickup must be in the future'; end if;
  if p_customer_type not in ('philippine_resident','international_visitor') then raise exception 'Invalid customer type'; end if;
  if p_license_expiration < (now() at time zone 'Asia/Manila')::date then raise exception 'Driver license is expired'; end if;
  select b.id,b.booking_reference,v.id into v_booking_id,v_reference,v_verification_id from public.bookings b join public.customers c on c.id=b.customer_id join public.customer_verifications v on v.booking_id=b.id where b.idempotency_key=p_idempotency_key and c.auth_user_id=v_user;
  if found then return query select v_booking_id,v_reference,v_verification_id; return; end if;
  select * into v_settings from public.booking_settings where id=true;
  select * into v_quote from private.calculate_booking_quote(p_model_id,p_start_at,p_end_at,true);
  perform pg_advisory_xact_lock(hashtextextended(p_model_id::text,0));
  update public.booking_inventory_holds set released_at=now() where released_at is null and converted_at is null and expires_at<=now();
  select u.id into v_unit_id from public.motorcycle_units u where u.motorcycle_model_id=p_model_id and u.status='available' and u.archived_at is null
    and not exists(select 1 from public.bookings b where b.motorcycle_unit_id=u.id and b.status in ('pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)'))
    and not exists(select 1 from public.booking_inventory_holds h where h.motorcycle_unit_id=u.id and h.released_at is null and h.converted_at is null and tstzrange(h.start_at,h.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)'))
    and not exists(select 1 from public.motorcycle_unavailability x where x.motorcycle_unit_id=u.id and tstzrange(x.start_at,x.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)')) order by u.internal_unit_code for update of u skip locked limit 1;
  if v_unit_id is null then raise exception 'No physical unit is available for those dates'; end if;
  insert into public.customers(auth_user_id,full_name,email,phone,country_of_residence,customer_type) values(v_user,trim(p_full_name),lower(trim(p_email)),trim(p_phone),trim(p_country),p_customer_type)
  on conflict(auth_user_id) do update set full_name=excluded.full_name,email=excluded.email,phone=excluded.phone,country_of_residence=excluded.country_of_residence,customer_type=excluded.customer_type,updated_at=now() returning id into v_customer_id;
  v_reference:='KJM-'||to_char(now() at time zone 'Asia/Manila','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.bookings(booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,pricing_daily_rate_php,pricing_units,submitted_at,expires_at,idempotency_key)
  values(v_reference,v_customer_id,p_model_id,p_start_at,p_end_at,'pending',v_quote.total_php,v_quote.daily_rate_php,v_quote.pricing_units,now(),now()+make_interval(mins=>v_settings.pending_expiration_minutes),p_idempotency_key)
  returning id into v_booking_id;
  if v_settings.pending_hold_minutes is not null then
    insert into public.booking_inventory_holds(booking_id,motorcycle_unit_id,start_at,end_at,expires_at) values(v_booking_id,v_unit_id,p_start_at,p_end_at,least(now()+make_interval(mins=>v_settings.pending_hold_minutes),now()+make_interval(mins=>v_settings.pending_expiration_minutes)));
  end if;
  insert into public.customer_verifications(booking_id,customer_id,customer_type,identity_status,license_status,entitlement_status,international_status,overall_status,license_issuing_country,license_expiration_date,permitted_vehicle_categories,philippines_entry_date,identity_name,license_name,customer_declaration_at,privacy_consent_at)
  values(v_booking_id,v_customer_id,p_customer_type,'submitted','submitted','under_review',case when p_customer_type='international_visitor' then 'under_review' else 'not_applicable' end,'submitted',p_license_country,p_license_expiration,p_vehicle_categories,p_entry_date,trim(p_identity_name),trim(p_license_name),now(),now()) returning id into v_verification_id;
  insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(v_booking_id,null,'pending',v_user);
  insert into public.notification_events(booking_id,event_type) values(v_booking_id,'booking_request_created');
  return query select v_booking_id,v_reference,v_verification_id;
end; $$;

drop function if exists private.is_active_booking_tester(uuid);
drop table if exists public.booking_testers;
alter table public.booking_settings
  drop constraint if exists booking_settings_public_or_developer_not_both;
revoke select (developer_testing_enabled) on public.booking_settings from authenticated;
alter table public.booking_settings drop column if exists developer_testing_enabled;

-- Retain generic provenance fields so synthetic readiness fixtures can be
-- identified without deleting or rewriting any legitimate historical rows.
comment on column public.customers.is_test is
  'True only for explicitly identified synthetic readiness-test data.';
comment on column public.bookings.is_test is
  'True only for explicitly identified synthetic readiness-test data.';
comment on column public.verification_documents.is_test is
  'True only for explicitly identified synthetic readiness-test data.';
