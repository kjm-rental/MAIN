-- Phase 5.2: server-controlled booking policy enforcement, expiration, holds,
-- atomic rescheduling, and separately recorded technical readiness evidence.

alter table public.bookings
  add column if not exists expires_at timestamptz,
  add column if not exists status_reason text;

create table public.booking_inventory_holds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  motorcycle_unit_id uuid not null references public.motorcycle_units(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  expires_at timestamptz not null,
  released_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint booking_inventory_holds_valid_period check (end_at > start_at),
  constraint booking_inventory_holds_valid_expiry check (expires_at > created_at),
  constraint booking_inventory_holds_single_terminal_state check (released_at is null or converted_at is null),
  constraint booking_inventory_holds_no_overlap exclude using gist (
    motorcycle_unit_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (released_at is null and converted_at is null)
);

create index booking_inventory_holds_expiry_idx
on public.booking_inventory_holds (expires_at)
where released_at is null and converted_at is null;

create table public.booking_readiness_checks (
  check_key text primary key check (length(trim(check_key)) > 0),
  passed boolean not null default false,
  checked_at timestamptz,
  checked_by uuid references auth.users(id) on delete set null,
  evidence text,
  updated_at timestamptz not null default now()
);

insert into public.booking_readiness_checks (check_key) values
  ('database_lint'), ('submission_runtime'), ('idempotent_retry'),
  ('competing_hold_race'), ('expiration_confirmation_race'),
  ('operating_hours'), ('pricing'), ('verification_gate'),
  ('reschedule_conflict'), ('document_security')
on conflict (check_key) do nothing;

alter table public.booking_inventory_holds enable row level security;
alter table public.booking_inventory_holds force row level security;
alter table public.booking_readiness_checks enable row level security;
alter table public.booking_readiness_checks force row level security;
revoke all on public.booking_inventory_holds, public.booking_readiness_checks from anon, authenticated;
grant select, insert, update, delete on public.booking_inventory_holds, public.booking_readiness_checks to authenticated;
create policy booking_inventory_holds_admin_all on public.booking_inventory_holds
for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create policy booking_readiness_checks_admin_all on public.booking_readiness_checks
for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create trigger booking_readiness_checks_set_updated_at before update on public.booking_readiness_checks
for each row execute function public.set_updated_at();

create or replace function public.prevent_unready_booking_activation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.public_booking_enabled and (
    not private.is_active_admin()
    or exists(select 1 from public.booking_readiness_checks where passed is not true)
  ) then raise exception 'Public booking cannot be enabled until every technical readiness check has passed'; end if;
  return new;
end; $$;
revoke all on function public.prevent_unready_booking_activation() from public,anon,authenticated;
create trigger booking_settings_require_technical_readiness
before insert or update of public_booking_enabled on public.booking_settings
for each row execute function public.prevent_unready_booking_activation();

create or replace function private.assert_booking_period_allowed(
  p_start_at timestamptz, p_end_at timestamptz, p_operating_hours jsonb
) returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_start timestamp := p_start_at at time zone 'Asia/Manila';
  v_end timestamp := p_end_at at time zone 'Asia/Manila';
  v_start_day jsonb; v_end_day jsonb;
begin
  if p_end_at <= p_start_at then raise exception 'Return must be after pickup'; end if;
  if p_operating_hours is null then raise exception 'Operating hours are not configured'; end if;
  v_start_day := p_operating_hours -> lower(to_char(v_start, 'FMDay'));
  v_end_day := p_operating_hours -> lower(to_char(v_end, 'FMDay'));
  if coalesce((v_start_day ->> 'enabled')::boolean, false) is not true then raise exception 'Pickup day is closed'; end if;
  if coalesce((v_end_day ->> 'enabled')::boolean, false) is not true then raise exception 'Return day is closed'; end if;
  if v_start::time < (v_start_day ->> 'pickupOpen')::time or v_start::time > (v_start_day ->> 'pickupClose')::time then raise exception 'Pickup is outside operating hours'; end if;
  if v_end::time < (v_end_day ->> 'returnOpen')::time or v_end::time > (v_end_day ->> 'returnClose')::time then raise exception 'Return is outside operating hours'; end if;
end; $$;
revoke all on function private.assert_booking_period_allowed(timestamptz,timestamptz,jsonb) from public,anon,authenticated;

create or replace function private.calculate_booking_quote(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_require_public_enabled boolean)
returns table (pricing_units integer,daily_rate_php integer,total_php integer)
language plpgsql stable security definer set search_path='' as $$
declare
  v_settings public.booking_settings%rowtype; v_rate integer; v_seconds bigint; v_units integer; v_total integer;
  v_start_local timestamp := p_start_at at time zone 'Asia/Manila';
  v_end_local timestamp := p_end_at at time zone 'Asia/Manila';
begin
  select * into v_settings from public.booking_settings where id=true;
  if p_require_public_enabled and (not v_settings.public_booking_enabled or v_settings.policies_approved_at is null) then raise exception 'Online booking is not enabled'; end if;
  perform private.assert_booking_period_allowed(p_start_at,p_end_at,v_settings.operating_hours);
  select m.daily_rate_php into v_rate from public.motorcycle_models m where m.id=p_model_id and m.is_published and m.archived_at is null;
  if v_rate is null then raise exception 'Motorcycle is unavailable'; end if;
  v_seconds := extract(epoch from (p_end_at-p_start_at))::bigint;
  if v_settings.partial_day_policy='started_24_hours' then
    if v_settings.partial_day_pricing_policy='not_allowed' and mod(v_seconds,86400)<>0 then raise exception 'Partial rental days are not allowed'; end if;
    v_units := greatest(1,ceil(v_seconds::numeric/86400)::integer);
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

create or replace function public.get_booking_quote(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz)
returns table (pricing_units integer,daily_rate_php integer,total_php integer)
language sql stable security definer set search_path='' as $$
  select * from private.calculate_booking_quote(p_model_id,p_start_at,p_end_at,true);
$$;
revoke all on function public.get_booking_quote(uuid,timestamptz,timestamptz) from public;
grant execute on function public.get_booking_quote(uuid,timestamptz,timestamptz) to anon,authenticated;

create or replace function public.check_model_availability(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz)
returns integer language plpgsql stable security definer set search_path='' as $$
declare v_count integer;
begin
  perform public.get_booking_quote(p_model_id,p_start_at,p_end_at);
  select count(*)::integer into v_count from public.motorcycle_units u
  where u.motorcycle_model_id=p_model_id and u.status='available' and u.archived_at is null
    and not exists(select 1 from public.bookings b where b.motorcycle_unit_id=u.id and b.status in ('pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)'))
    and not exists(select 1 from public.booking_inventory_holds h where h.motorcycle_unit_id=u.id and h.released_at is null and h.converted_at is null and h.expires_at>now() and tstzrange(h.start_at,h.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)'))
    and not exists(select 1 from public.motorcycle_unavailability x where x.motorcycle_unit_id=u.id and tstzrange(x.start_at,x.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)'));
  return v_count;
end; $$;

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
  values(v_reference,v_customer_id,p_model_id,p_start_at,p_end_at,'submitted',v_quote.total_php,v_quote.daily_rate_php,v_quote.pricing_units,now(),now()+make_interval(mins=>v_settings.pending_expiration_minutes),p_idempotency_key)
  returning id into v_booking_id;
  if v_settings.pending_hold_minutes is not null then
    insert into public.booking_inventory_holds(booking_id,motorcycle_unit_id,start_at,end_at,expires_at) values(v_booking_id,v_unit_id,p_start_at,p_end_at,least(now()+make_interval(mins=>v_settings.pending_hold_minutes),now()+make_interval(mins=>v_settings.pending_expiration_minutes)));
  end if;
  insert into public.customer_verifications(booking_id,customer_id,customer_type,identity_status,license_status,entitlement_status,international_status,overall_status,license_issuing_country,license_expiration_date,permitted_vehicle_categories,philippines_entry_date,identity_name,license_name,customer_declaration_at,privacy_consent_at)
  values(v_booking_id,v_customer_id,p_customer_type,'submitted','submitted','under_review',case when p_customer_type='international_visitor' then 'under_review' else 'not_applicable' end,'submitted',p_license_country,p_license_expiration,p_vehicle_categories,p_entry_date,trim(p_identity_name),trim(p_license_name),now(),now()) returning id into v_verification_id;
  insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(v_booking_id,null,'submitted',v_user);
  insert into public.notification_events(booking_id,event_type) values(v_booking_id,'booking_request_created');
  return query select v_booking_id,v_reference,v_verification_id;
end; $$;

create or replace function public.expire_pending_bookings()
returns integer language plpgsql security definer set search_path='' as $$
declare v record; v_count integer:=0;
begin
  for v in select id,status from public.bookings where status in ('submitted','pending') and expires_at is not null and expires_at<=now() for update skip locked loop
    update public.bookings set status='expired',status_reason='Pending request expired automatically' where id=v.id and status=v.status;
    if found then
      update public.booking_inventory_holds set released_at=now() where booking_id=v.id and released_at is null and converted_at is null;
      insert into public.booking_status_history(booking_id,old_status,new_status) values(v.id,v.status,'expired');
      insert into public.audit_logs(action,entity_type,entity_id,metadata) values('booking.expired','booking',v.id,jsonb_build_object('source','scheduled_expiration'));
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end; $$;
revoke all on function public.expire_pending_bookings() from public,anon,authenticated;
grant execute on function public.expire_pending_bookings() to service_role;

create or replace function public.admin_confirm_booking(p_booking_id uuid,p_unit_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v public.bookings%rowtype; x public.customer_verifications%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
  select * into v from public.bookings where id=p_booking_id for update;
  if v.status not in ('submitted','pending') or (v.expires_at is not null and v.expires_at<=now()) then raise exception 'Booking cannot be confirmed because it is not active'; end if;
  select * into x from public.customer_verifications where booking_id=p_booking_id for update;
  if x.identity_status<>'approved' or x.license_status<>'approved' or x.entitlement_status<>'approved' or x.international_status not in ('approved','not_applicable') or x.overall_status<>'approved' then raise exception 'Every required verification check must be approved'; end if;
  if x.license_expiration_date < (now() at time zone 'Asia/Manila')::date then raise exception 'Driver license is expired'; end if;
  if not exists(select 1 from public.verification_documents d where d.booking_id=p_booking_id and d.document_kind='drivers_license_front') then raise exception 'Driver license document is missing'; end if;
  if not exists(select 1 from public.verification_documents d where d.booking_id=p_booking_id and d.document_kind=case when x.customer_type='international_visitor' then 'passport' else 'government_id' end) then raise exception 'Identity document is missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_unit_id::text,0));
  if not exists(select 1 from public.motorcycle_units u where u.id=p_unit_id and u.motorcycle_model_id=v.motorcycle_model_id and u.status='available' and u.archived_at is null) then raise exception 'Selected unit is unavailable'; end if;
  if exists(select 1 from public.bookings b where b.motorcycle_unit_id=p_unit_id and b.id<>p_booking_id and b.status in ('pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(v.start_at,v.end_at,'[)')) or exists(select 1 from public.booking_inventory_holds h where h.motorcycle_unit_id=p_unit_id and h.booking_id<>p_booking_id and h.released_at is null and h.converted_at is null and h.expires_at>now() and tstzrange(h.start_at,h.end_at,'[)')&&tstzrange(v.start_at,v.end_at,'[)')) or exists(select 1 from public.motorcycle_unavailability m where m.motorcycle_unit_id=p_unit_id and tstzrange(m.start_at,m.end_at,'[)')&&tstzrange(v.start_at,v.end_at,'[)')) then raise exception 'Selected unit conflicts with another booking, hold, or maintenance block'; end if;
  update public.bookings set motorcycle_unit_id=p_unit_id,status='confirmed',approved_by=auth.uid(),expires_at=null where id=p_booking_id;
  update public.booking_inventory_holds set converted_at=case when motorcycle_unit_id=p_unit_id then now() else converted_at end,released_at=case when motorcycle_unit_id<>p_unit_id then now() else released_at end where booking_id=p_booking_id and released_at is null and converted_at is null;
  insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(p_booking_id,v.status,'confirmed',auth.uid());
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'booking.confirmed','booking',p_booking_id);
  insert into public.notification_events(booking_id,event_type) values(p_booking_id,'booking_approved');
end; $$;

create or replace function public.admin_reschedule_booking(p_booking_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_unit_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.bookings%rowtype; q record; target_unit uuid;
begin
  if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
  select * into v from public.bookings where id=p_booking_id for update;
  if v.status not in ('confirmed','active') then raise exception 'Only confirmed or active bookings can be rescheduled'; end if;
  if v.status='active' and p_start_at<>v.start_at then raise exception 'An active rental pickup cannot be changed'; end if;
  target_unit:=coalesce(p_unit_id,v.motorcycle_unit_id);
  perform pg_advisory_xact_lock(hashtextextended(target_unit::text,0));
  select * into q from private.calculate_booking_quote(v.motorcycle_model_id,p_start_at,p_end_at,false);
  if exists(select 1 from public.bookings b where b.motorcycle_unit_id=target_unit and b.id<>p_booking_id and b.status in ('pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)')) or exists(select 1 from public.booking_inventory_holds h where h.motorcycle_unit_id=target_unit and h.booking_id<>p_booking_id and h.released_at is null and h.converted_at is null and h.expires_at>now() and tstzrange(h.start_at,h.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)')) or exists(select 1 from public.motorcycle_unavailability m where m.motorcycle_unit_id=target_unit and tstzrange(m.start_at,m.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)')) then raise exception 'Requested schedule conflicts with a booking, hold, or maintenance block'; end if;
  update public.bookings set motorcycle_unit_id=target_unit,start_at=p_start_at,end_at=p_end_at,quoted_total_php=q.total_php,pricing_daily_rate_php=q.daily_rate_php,pricing_units=q.pricing_units where id=p_booking_id;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'booking.rescheduled','booking',p_booking_id,jsonb_build_object('old_start',v.start_at,'old_end',v.end_at,'new_start',p_start_at,'new_end',p_end_at,'unit_id',target_unit));
end; $$;

create or replace function public.admin_transition_booking_with_reason(p_booking_id uuid,p_new_status text,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_new_status in ('rejected','cancelled') and length(trim(coalesce(p_reason,'')))=0 then raise exception 'A reason is required'; end if;
  perform public.admin_transition_booking(p_booking_id,p_new_status);
  update public.bookings set status_reason=p_reason where id=p_booking_id;
  update public.booking_inventory_holds set released_at=now() where booking_id=p_booking_id and released_at is null and converted_at is null and p_new_status in ('rejected','cancelled');
end; $$;

revoke all on function public.admin_reschedule_booking(uuid,timestamptz,timestamptz,uuid),public.admin_transition_booking_with_reason(uuid,text,text) from public,anon;
grant execute on function public.admin_reschedule_booking(uuid,timestamptz,timestamptz,uuid),public.admin_transition_booking_with_reason(uuid,text,text) to authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'kjm-expire-pending-bookings',
  '* * * * *',
  'select public.expire_pending_bookings()'
);
