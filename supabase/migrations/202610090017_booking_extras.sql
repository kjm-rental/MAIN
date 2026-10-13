-- Optional, administrator-managed flat-fee booking extras.
-- Existing bookings are preserved and backfilled with a zero extras total.

create table public.booking_extras_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  price_php integer not null check (price_php >= 0),
  is_available boolean not null default false,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index booking_extras_catalog_name_unique
on public.booking_extras_catalog (lower(name));
create index booking_extras_catalog_display_idx
on public.booking_extras_catalog (is_available desc, display_order, name);

create table public.booking_extra_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  extra_id uuid references public.booking_extras_catalog(id) on delete set null,
  name_snapshot text not null check (length(trim(name_snapshot)) > 0),
  price_php_snapshot integer not null check (price_php_snapshot >= 0),
  created_at timestamptz not null default now()
);
create unique index booking_extra_items_booking_extra_unique
on public.booking_extra_items (booking_id,extra_id) where extra_id is not null;

alter table public.bookings
  add column base_total_php integer not null default 0 check (base_total_php >= 0),
  add column extras_total_php integer not null default 0 check (extras_total_php >= 0);
update public.bookings set base_total_php=quoted_total_php,extras_total_php=0;
alter table public.bookings add constraint bookings_total_components_check
check (quoted_total_php=base_total_php+extras_total_php);

create trigger booking_extras_catalog_set_updated_at before update on public.booking_extras_catalog
for each row execute function public.set_updated_at();

alter table public.booking_extras_catalog enable row level security;
alter table public.booking_extras_catalog force row level security;
alter table public.booking_extra_items enable row level security;
alter table public.booking_extra_items force row level security;
revoke all on public.booking_extras_catalog,public.booking_extra_items from anon,authenticated;

grant select on public.booking_extras_catalog to anon,authenticated;
create policy booking_extras_available_read on public.booking_extras_catalog
for select to anon,authenticated using (is_available);
grant select,insert,update,delete on public.booking_extras_catalog to authenticated;
create policy booking_extras_admin_all on public.booking_extras_catalog
for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));

grant select on public.booking_extra_items to authenticated;
create policy booking_extra_items_owner_read on public.booking_extra_items
for select to authenticated using (exists(
  select 1 from public.bookings booking join public.customers customer on customer.id=booking.customer_id
  where booking.id=booking_id and customer.auth_user_id=(select auth.uid())
));
grant select,insert,update,delete on public.booking_extra_items to authenticated;
create policy booking_extra_items_admin_all on public.booking_extra_items
for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));

create or replace function private.calculate_extras_total(p_extra_ids uuid[])
returns integer language plpgsql stable security definer set search_path='' as $$
declare v_count integer; v_total integer;
begin
  if coalesce(cardinality(p_extra_ids),0)=0 then return 0; end if;
  select count(*)::integer,coalesce(sum(extra.price_php),0)::integer into v_count,v_total
  from public.booking_extras_catalog extra where extra.id=any(p_extra_ids) and extra.is_available;
  if v_count<>cardinality(p_extra_ids) then
    raise exception 'One or more selected extras are unavailable or duplicated';
  end if;
  return v_total;
end; $$;
revoke all on function private.calculate_extras_total(uuid[]) from public,anon,authenticated;

create or replace function public.get_booking_quote_with_extras(
  p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_extra_ids uuid[] default '{}'
) returns table (pricing_units integer,daily_rate_php integer,base_total_php integer,extras_total_php integer,total_php integer)
language plpgsql stable security definer set search_path='' as $$
declare q record; v_extras integer;
begin
  select * into q from private.calculate_booking_quote(p_model_id,p_start_at,p_end_at,true);
  v_extras:=private.calculate_extras_total(p_extra_ids);
  return query select q.pricing_units,q.daily_rate_php,q.total_php,v_extras,q.total_php+v_extras;
end; $$;
revoke all on function public.get_booking_quote_with_extras(uuid,timestamptz,timestamptz,uuid[]) from public;
grant execute on function public.get_booking_quote_with_extras(uuid,timestamptz,timestamptz,uuid[]) to anon,authenticated;

create or replace function public.submit_booking_request_with_extras(
  p_idempotency_key uuid,p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_extra_ids uuid[],
  p_full_name text,p_email text,p_phone text,p_country text,p_customer_type text,
  p_identity_name text,p_license_name text,p_license_country text,p_license_expiration date,
  p_vehicle_categories text,p_entry_date date,p_privacy_consent boolean,p_declaration boolean
) returns table (booking_id uuid,booking_reference text,verification_id uuid)
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_settings public.booking_settings%rowtype; v_quote record; v_extras integer;
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
  v_extras:=private.calculate_extras_total(p_extra_ids);
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
  insert into public.bookings(booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,base_total_php,extras_total_php,pricing_daily_rate_php,pricing_units,submitted_at,expires_at,idempotency_key)
  values(v_reference,v_customer_id,p_model_id,p_start_at,p_end_at,'pending',v_quote.total_php+v_extras,v_quote.total_php,v_extras,v_quote.daily_rate_php,v_quote.pricing_units,now(),now()+make_interval(mins=>v_settings.pending_expiration_minutes),p_idempotency_key)
  returning id into v_booking_id;
  insert into public.booking_extra_items(booking_id,extra_id,name_snapshot,price_php_snapshot)
  select v_booking_id,extra.id,extra.name,extra.price_php from public.booking_extras_catalog extra
  where extra.id=any(coalesce(p_extra_ids,'{}'::uuid[])) and extra.is_available;
  if v_settings.pending_hold_minutes is not null then
    insert into public.booking_inventory_holds(booking_id,motorcycle_unit_id,start_at,end_at,expires_at) values(v_booking_id,v_unit_id,p_start_at,p_end_at,least(now()+make_interval(mins=>v_settings.pending_hold_minutes),now()+make_interval(mins=>v_settings.pending_expiration_minutes)));
  end if;
  insert into public.customer_verifications(booking_id,customer_id,customer_type,identity_status,license_status,entitlement_status,international_status,overall_status,license_issuing_country,license_expiration_date,permitted_vehicle_categories,philippines_entry_date,identity_name,license_name,customer_declaration_at,privacy_consent_at)
  values(v_booking_id,v_customer_id,p_customer_type,'submitted','submitted','under_review',case when p_customer_type='international_visitor' then 'under_review' else 'not_applicable' end,'submitted',p_license_country,p_license_expiration,p_vehicle_categories,p_entry_date,trim(p_identity_name),trim(p_license_name),now(),now()) returning id into v_verification_id;
  insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(v_booking_id,null,'pending',v_user);
  insert into public.notification_events(booking_id,event_type) values(v_booking_id,'booking_request_created');
  return query select v_booking_id,v_reference,v_verification_id;
end; $$;
revoke all on function public.submit_booking_request_with_extras(uuid,uuid,timestamptz,timestamptz,uuid[],text,text,text,text,text,text,text,text,date,text,date,boolean,boolean) from public,anon;
grant execute on function public.submit_booking_request_with_extras(uuid,uuid,timestamptz,timestamptz,uuid[],text,text,text,text,text,text,text,text,date,text,date,boolean,boolean) to authenticated;

-- Preserve the existing submission contract for clients that do not request extras.
create or replace function public.submit_booking_request(
  p_idempotency_key uuid,p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,
  p_full_name text,p_email text,p_phone text,p_country text,p_customer_type text,
  p_identity_name text,p_license_name text,p_license_country text,p_license_expiration date,
  p_vehicle_categories text,p_entry_date date,p_privacy_consent boolean,p_declaration boolean
) returns table (booking_id uuid,booking_reference text,verification_id uuid)
language sql security definer set search_path='' as $$
  select * from public.submit_booking_request_with_extras(
    p_idempotency_key,p_model_id,p_start_at,p_end_at,'{}'::uuid[],
    p_full_name,p_email,p_phone,p_country,p_customer_type,
    p_identity_name,p_license_name,p_license_country,p_license_expiration,
    p_vehicle_categories,p_entry_date,p_privacy_consent,p_declaration
  );
$$;
revoke all on function public.submit_booking_request(uuid,uuid,timestamptz,timestamptz,text,text,text,text,text,text,text,text,date,text,date,boolean,boolean) from public,anon;
grant execute on function public.submit_booking_request(uuid,uuid,timestamptz,timestamptz,text,text,text,text,text,text,text,text,date,text,date,boolean,boolean) to authenticated;

-- A reschedule reprices the rental period while retaining the immutable extras snapshot.
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
  update public.bookings set motorcycle_unit_id=target_unit,start_at=p_start_at,end_at=p_end_at,base_total_php=q.total_php,quoted_total_php=q.total_php+extras_total_php,pricing_daily_rate_php=q.daily_rate_php,pricing_units=q.pricing_units where id=p_booking_id;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'booking.rescheduled','booking',p_booking_id,jsonb_build_object('old_start',v.start_at,'old_end',v.end_at,'new_start',p_start_at,'new_end',p_end_at,'unit_id',target_unit));
end; $$;
revoke all on function public.admin_reschedule_booking(uuid,timestamptz,timestamptz,uuid) from public,anon;
grant execute on function public.admin_reschedule_booking(uuid,timestamptz,timestamptz,uuid) to authenticated;

comment on table public.booking_extras_catalog is 'Administrator-managed optional flat-fee booking extras.';
comment on table public.booking_extra_items is 'Immutable booking extra name and price snapshots; never recalculate historical bookings from the catalog.';
