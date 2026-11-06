-- OWNER REVIEW ONLY. Never run automatically.
-- Requires schema.prepared.sql already applied, MAIN migrations through 039,
-- and ADMIN docs/migrations/202610270039_admin_manual_bookings.sql.
-- No inventory creation, historical backfill, price or PayMongo changes.
-- Existing submission bodies below retain their authorization, idempotency,
-- locks, holds, exclusions and verification workflow; additions concern color.
begin;

create function private.normalize_motorcycle_color(p_color text)
returns text language sql immutable set search_path='' as $$
 select nullif(initcap(lower(regexp_replace(regexp_replace(btrim(p_color), '[[:space:]]+', ' ', 'g'), '[[:space:]]*/[[:space:]]*', ' / ', 'g'))),'');
$$;
revoke all on function private.normalize_motorcycle_color(text) from public,anon,authenticated,service_role;

-- Existing rows are not touched. Normalize only newly entered/changed values.
create function private.normalize_motorcycle_unit_fields() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.registration_plate:=nullif(upper(btrim(new.registration_plate)),'');
  new.color:=private.normalize_motorcycle_color(new.color);
  if new.registration_plate is null or new.color is null then
   raise exception 'License plate and motorcycle color are required for new units';
  end if;
 else
  if new.registration_plate is distinct from old.registration_plate then new.registration_plate:=nullif(upper(btrim(new.registration_plate)),'');end if;
  if new.color is distinct from old.color then new.color:=private.normalize_motorcycle_color(new.color);end if;
 end if;
 if (tg_op='INSERT' or new.registration_plate is distinct from old.registration_plate)
 and new.registration_plate is not null and (length(new.registration_plate) not between 2 and 20 or new.registration_plate !~ '^[A-Z0-9 -]+$' or new.registration_plate !~ '[A-Z0-9]') then
  raise exception 'Enter a valid license plate using letters, numbers, spaces or hyphens';
 end if;
 return new;
end;$$;
revoke all on function private.normalize_motorcycle_unit_fields() from public,anon,authenticated,service_role;
create trigger motorcycle_units_normalize_fields before insert or update on public.motorcycle_units
for each row execute function private.normalize_motorcycle_unit_fields();

-- Reuse the inventory eligibility rules, including live holds and maintenance.
create function private.color_eligible_units(p_model uuid,p_start timestamptz,p_end timestamptz,p_exclude uuid default null)
returns setof public.motorcycle_units language sql stable security definer set search_path='' as $$
 select u.* from public.motorcycle_units u
 where u.motorcycle_model_id=p_model and u.archived_at is null and u.status='available'
 and not exists(select 1 from public.bookings b where b.id is distinct from p_exclude and b.motorcycle_unit_id=u.id and b.status in ('pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(p_start,p_end,'[)'))
 and not exists(select 1 from public.booking_inventory_holds h where h.booking_id is distinct from p_exclude and h.motorcycle_unit_id=u.id and h.released_at is null and h.converted_at is null and h.expires_at>now() and tstzrange(h.start_at,h.end_at,'[)')&&tstzrange(p_start,p_end,'[)'))
 and not exists(select 1 from public.motorcycle_unavailability x where x.motorcycle_unit_id=u.id and tstzrange(x.start_at,x.end_at,'[)')&&tstzrange(p_start,p_end,'[)'));
$$;
revoke all on function private.color_eligible_units(uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated,service_role;

create function public.get_motorcycle_color_availability(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz)
returns table(color text,available_count integer) language plpgsql stable security definer set search_path='' as $$
begin
 perform private.calculate_booking_quote(p_model_id,p_start_at,p_end_at,false);
 return query
 select private.normalize_motorcycle_color(u.color),count(e.id)::integer
 from public.motorcycle_units u
 left join private.color_eligible_units(p_model_id,p_start_at,p_end_at) e on e.id=u.id
 where u.motorcycle_model_id=p_model_id and u.archived_at is null
 and private.normalize_motorcycle_color(u.color) is not null
 group by private.normalize_motorcycle_color(u.color) order by 1;
end;$$;
revoke all on function public.get_motorcycle_color_availability(uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.get_motorcycle_color_availability(uuid,timestamptz,timestamptz) to anon,authenticated;

-- Defense in depth: assignment/confirmation and live holds must match snapshot.
-- An unrelated edit to a historical booking does not suddenly require a color.
create function private.guard_booking_unit_color() returns trigger
language plpgsql security definer set search_path='' as $$
declare required_color text; model uuid; unit_color text; unit_model uuid;
begin
 if tg_table_name='booking_inventory_holds' then
  if new.released_at is not null or new.converted_at is not null or new.expires_at<=now() then return new;end if;
  select b.selected_color,b.motorcycle_model_id into required_color,model from public.bookings b where b.id=new.booking_id;
 else
  required_color:=new.selected_color;model:=new.motorcycle_model_id;
  if tg_op='UPDATE' and new.selected_color is distinct from old.selected_color and not private.is_active_admin() then
   raise exception 'Selected motorcycle color cannot be changed';
  end if;
  if new.motorcycle_unit_id is null or new.status not in ('pending','confirmed','active') then return new;end if;
  if tg_op='UPDATE' and new.motorcycle_unit_id is not distinct from old.motorcycle_unit_id
   and new.selected_color is not distinct from old.selected_color and new.motorcycle_model_id is not distinct from old.motorcycle_model_id
   and new.start_at is not distinct from old.start_at and new.end_at is not distinct from old.end_at
   and new.status is not distinct from old.status then return new;end if;
 end if;
 if required_color is not null then
  -- Share the unit lock with inventory edits and existing assignment guards.
  select u.color,u.motorcycle_model_id into unit_color,unit_model from public.motorcycle_units u where u.id=new.motorcycle_unit_id for share;
  if private.normalize_motorcycle_color(unit_color) is distinct from private.normalize_motorcycle_color(required_color) or unit_model is distinct from model then
   raise exception 'Selected color is no longer available. Choose another matching motorcycle or color.' using errcode='P0001';
  end if;
 end if;
 return new;
end;$$;
revoke all on function private.guard_booking_unit_color() from public,anon,authenticated,service_role;
create trigger bookings_guard_unit_color before insert or update on public.bookings
for each row execute function private.guard_booking_unit_color();
create trigger booking_holds_guard_unit_color before insert or update on public.booking_inventory_holds
for each row execute function private.guard_booking_unit_color();

-- Guest core from MAIN migration 035; delivery wrapper from 037 remains intact.
create or replace function public.submit_guest_booking_request_core(p_payload jsonb,p_access_hash text)
returns table(booking_id uuid,booking_reference text,verification_id uuid,rental_total_centavos integer,deposit_required_centavos integer,cash_due_at_pickup_centavos bigint)
language plpgsql security definer set search_path='' as $$
declare selected_color text:=private.normalize_motorcycle_color(p_payload->>'p_selected_color'); model uuid:=(p_payload->>'p_model_id')::uuid; starts timestamptz:=(p_payload->>'p_start_at')::timestamptz; ends timestamptz:=(p_payload->>'p_end_at')::timestamptz;
 idem uuid:=(p_payload->>'p_idempotency_key')::uuid; customer_type text:=p_payload->>'p_customer_type'; email text:=lower(btrim(p_payload->>'p_email'));
 bs public.booking_settings%rowtype; ds public.security_deposit_settings%rowtype; q record; old record; line record;
 customer_id uuid; bid uuid; vid uuid; ref text; unit_id uuid; fingerprint text; extras_php integer:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server authorization required'; end if;
 if p_access_hash is null or p_access_hash !~ '^[a-f0-9]{64}$' or idem is null or octet_length(p_payload::text)>20000 then raise exception 'Invalid guest request'; end if;
 fingerprint:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(idem::text,35));
 select b.id,b.booking_reference,b.total_centavos,v.id verification_id,b.deposit_required_centavos,g.access_hash,g.request_fingerprint into old
 from public.bookings b join public.guest_booking_contacts g on g.booking_id=b.id join public.customer_verifications v on v.booking_id=b.id where b.idempotency_key=idem;
 if found then
  if old.access_hash is distinct from p_access_hash or old.request_fingerprint is distinct from fingerprint then raise exception 'Request mismatch'; end if;
  return query select old.id,old.booking_reference,old.verification_id,old.total_centavos,old.deposit_required_centavos,old.total_centavos::bigint+old.deposit_required_centavos;return;
 end if;
 -- Durable guest abuse limits apply even when no external bot-check provider is configured.
 perform pg_advisory_xact_lock(hashtextextended('guest-checkout-rate',35));
 if (select count(*) from public.guest_booking_contacts where access_hash=p_access_hash and created_at>now()-interval '1 hour')>=5
 or (select count(*) from public.guest_booking_contacts where created_at>now()-interval '1 minute')>=60 then raise exception 'Please try later'; end if;
 select * into bs from public.booking_settings where id=true for share;
 if not coalesce(bs.public_booking_enabled and bs.policies_approved_at is not null,false) then raise exception 'Public booking is unavailable'; end if;
 if starts<=now() or ends-starts<interval '24 hours' then raise exception 'Invalid rental dates'; end if;
 if customer_type not in ('philippine_resident','international_visitor') or coalesce((p_payload->>'p_privacy_consent')::boolean,false) is not true or coalesce((p_payload->>'p_declaration')::boolean,false) is not true then raise exception 'Required declarations missing'; end if;
 if email is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(email)>254 or length(btrim(coalesce(p_payload->>'p_full_name',''))) not between 2 and 160 or coalesce(p_payload->>'p_phone','') !~ '^\+?[0-9][0-9[:space:]()-]{6,24}$' or length(btrim(coalesce(p_payload->>'p_country',''))) not between 2 and 100 then raise exception 'Invalid contact details'; end if;
 if length(btrim(coalesce(p_payload->>'p_identity_name','')))=0 or length(btrim(coalesce(p_payload->>'p_license_name','')))=0 or length(btrim(coalesce(p_payload->>'p_license_country','')))=0 or (p_payload->>'p_license_expiration')::date<(now() at time zone 'Asia/Manila')::date or length(btrim(coalesce(p_payload->>'p_vehicle_categories','')))=0 then raise exception 'Invalid driving details'; end if;
 select * into ds from public.security_deposit_settings where id=true for share;
 if (p_payload->>'p_policy_version')::timestamptz is distinct from ds.updated_at then raise exception 'Deposit policy changed'; end if;
 select * into q from public.get_booking_quote_v3(model,starts,ends,p_payload->'p_extra_items',p_payload->>'p_deposit_option',p_payload->>'p_document_type');
 perform pg_advisory_xact_lock(hashtextextended(model::text,0));
 if selected_color is null and exists(select 1 from public.motorcycle_units where motorcycle_model_id=model and archived_at is null and private.normalize_motorcycle_color(color) is not null) then
  raise exception 'Choose your preferred motorcycle color';
 end if;
 select u.id into unit_id from public.motorcycle_units u where u.motorcycle_model_id=model and (selected_color is null or private.normalize_motorcycle_color(u.color)=selected_color) and u.status='available' and u.archived_at is null
 and not exists(select 1 from public.bookings b where b.motorcycle_unit_id=u.id and b.status in ('pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(starts,ends,'[)'))
 and not exists(select 1 from public.booking_inventory_holds h where h.motorcycle_unit_id=u.id and h.released_at is null and h.converted_at is null and h.expires_at>now() and tstzrange(h.start_at,h.end_at,'[)')&&tstzrange(starts,ends,'[)'))
 and not exists(select 1 from public.motorcycle_unavailability x where x.motorcycle_unit_id=u.id and tstzrange(x.start_at,x.end_at,'[)')&&tstzrange(starts,ends,'[)')) order by u.internal_unit_code for update of u skip locked limit 1;
 if unit_id is null then raise exception 'Selected color is unavailable for these dates. Choose another color or rental period.'; end if;
 perform 1 from private.calculate_extra_selection(p_payload->'p_extra_items',starts,ends,q.pricing_units,true);
 -- A separate contact per booking: another request cannot change this recipient.
 insert into public.customers(auth_user_id,full_name,email,phone,country_of_residence,customer_type) values(null,btrim(p_payload->>'p_full_name'),email,btrim(p_payload->>'p_phone'),btrim(p_payload->>'p_country'),customer_type) returning id into customer_id;
 ref:='KJM-'||to_char(now() at time zone 'Asia/Manila','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.bookings(selected_color,booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,base_total_php,extras_total_php,pricing_daily_rate_php,pricing_units,submitted_at,expires_at,idempotency_key)
 values(selected_color,ref,customer_id,model,starts,ends,'pending',q.total_centavos/100,q.base_total_centavos/100,q.extras_total_centavos/100,q.daily_rate_php,q.pricing_units,now(),now()+make_interval(mins=>bs.pending_expiration_minutes),idem) returning id into bid;
 insert into public.guest_booking_contacts values(bid,p_access_hash,email,fingerprint,now());
 for line in select * from private.calculate_extra_selection(p_payload->'p_extra_items',starts,ends,q.pricing_units,false) loop
  insert into public.booking_extra_items(booking_id,extra_id,name_snapshot,price_php_snapshot,quantity,pricing_model_snapshot,charged_units,line_total_centavos) values(bid,line.extra_id,line.name,line.price_php,line.quantity,line.pricing_model,line.charged_units,line.line_total_php*100);
 end loop;
 if bs.pending_hold_minutes is null then raise exception 'Reservation hold policy missing'; end if;
 insert into public.booking_inventory_holds(booking_id,motorcycle_unit_id,start_at,end_at,expires_at) values(bid,unit_id,starts,ends,least(now()+make_interval(mins=>bs.pending_hold_minutes),now()+make_interval(mins=>bs.pending_expiration_minutes)));
 insert into public.customer_verifications(booking_id,customer_id,customer_type,identity_status,license_status,entitlement_status,international_status,overall_status,license_issuing_country,license_expiration_date,permitted_vehicle_categories,philippines_entry_date,identity_name,license_name,customer_declaration_at,privacy_consent_at)
 values(bid,customer_id,customer_type,'submitted','submitted','under_review',case when customer_type='international_visitor' then 'under_review' else 'not_applicable' end,'submitted',p_payload->>'p_license_country',(p_payload->>'p_license_expiration')::date,p_payload->>'p_vehicle_categories',(p_payload->>'p_entry_date')::date,p_payload->>'p_identity_name',p_payload->>'p_license_name',now(),now()) returning id into vid;
 insert into public.booking_deposits(booking_id,option,required_centavos,document_type,partial_return_allowed,collection_instructions,return_instructions,dispute_instructions,policy_version,legal_reference,request_fingerprint,is_test)
 values(bid,p_payload->>'p_deposit_option',q.deposit_required_centavos,p_payload->>'p_document_type',ds.partial_cash_return_allowed,ds.collection_instructions,ds.return_instructions,ds.dispute_instructions,ds.updated_at,case when p_payload->>'p_deposit_option'='eligible_id' then ds.id_legal_reference else null end,fingerprint,false);
 update public.bookings set deposit_required_centavos=q.deposit_required_centavos where id=bid;
 insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(bid,null,'pending',null);
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(null,'booking.guest_requested','booking',bid,jsonb_build_object('guest',true));
 return query select bid,ref,vid,q.total_centavos,q.deposit_required_centavos,q.cash_due_at_pickup_centavos;
end; $$;
revoke all on function public.submit_guest_booking_request_core(jsonb,text) from public,anon,authenticated,service_role;

-- Versioned server-only entry point prevents the new app from silently using
-- a database that still ignores p_selected_color.
create function public.submit_guest_booking_request_with_color(p_payload jsonb,p_access_hash text)
returns table(booking_id uuid,booking_reference text,verification_id uuid,rental_total_centavos integer,deposit_required_centavos integer,cash_due_at_pickup_centavos bigint)
language sql security definer set search_path='' as $$
 select * from public.submit_guest_booking_request(p_payload,p_access_hash);
$$;
revoke all on function public.submit_guest_booking_request_with_color(jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_guest_booking_request_with_color(jsonb,text) to service_role;

-- Manual booking integration; source: ADMIN prepared migration 039.
create or replace function public.admin_quote_manual_booking(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare model uuid:=(p_payload->>'modelId')::uuid; bid uuid:=(p_payload->>'bookingId')::uuid;
 starts timestamptz:=(p_payload->>'startAt')::timestamptz; ends timestamptz:=(p_payload->>'endAt')::timestamptz;
 q record; ds public.security_deposit_settings%rowtype; b public.bookings%rowtype;
 extra integer; service jsonb; standard integer; final integer; kind text:=p_payload->'adjustment'->>'kind'; value numeric:=(p_payload->'adjustment'->>'value')::numeric;
 result jsonb; policy timestamptz;
begin
 if not private.is_active_admin() then raise exception 'Administrator access required';end if;
 if p_payload is null or octet_length(p_payload::text)>40000 or starts is null or ends is null or starts<=now() or ends-starts<interval '24 hours' then raise exception 'Choose a future rental period of at least 24 hours';end if;
 if bid is not null then
  select * into b from public.bookings where id=bid;
  if not exists(select 1 from public.booking_admin_details where booking_id=bid) or b.status not in ('pending','confirmed') or (b.status='pending' and b.expires_at<=now()) then raise exception 'Only unexpired pending or confirmed admin bookings can be edited';end if;
  if exists(select 1 from public.payment_events where booking_id=bid) or exists(select 1 from public.payment_intents where booking_id=bid) or exists(select 1 from public.security_deposit_events where booking_id=bid) or exists(select 1 from public.rental_inspections where booking_id=bid) then raise exception 'Financial or handover history exists. Use the existing authorized adjustment workflow';end if;
 end if;
 select * into q from private.calculate_booking_quote(model,starts,ends,false);
 if exists(select 1 from jsonb_array_elements(p_payload->'extras') item join public.booking_extras_catalog e on e.id=(item->>'id')::uuid where (e.name ~* 'top[ _-]*box' or cardinality(e.compatible_model_ids)>0) and not (model=any(e.compatible_model_ids))) then raise exception 'Selected accessory is not configured as compatible with this motorcycle';end if;
 select coalesce(sum(x.line_total_php),0)::integer into extra from private.calculate_extra_selection(p_payload->'extras',starts,ends,q.pricing_units,false,bid) x;
 service:=public.get_delivery_quote(p_payload->'services',starts,ends);
 select * into ds from public.security_deposit_settings where id;
 if not coalesce(ds.cash_enabled and ds.cash_policy_approved_at is not null and ds.cash_amount_centavos=250000,false) then raise exception 'An approved separate PHP 2,500 cash security deposit policy is required';end if;
 if not exists(select 1 from public.delivery_settings where id and cash_enabled) then raise exception 'Cash booking arrangements are currently disabled';end if;
 standard:=q.total_php+extra+(service->>'totalCentavos')::integer/100;
 if kind is null or kind not in ('none','fixed','percentage','agreed') or value is null or value<0 or value>10000000 or (kind='percentage' and (value>100 or round(value,2)<>value)) or (kind<>'percentage' and value<>trunc(value)) then raise exception 'Invalid price adjustment';end if;
 if kind<>'none' and length(trim(coalesce(p_payload->'adjustment'->>'reason',''))) not between 5 and 500 then raise exception 'A price adjustment reason is required';end if;
 final:=case kind when 'none' then standard when 'fixed' then standard-value::integer when 'percentage' then round(standard*(1-value/100))::integer else value::integer end;
 if final<0 then raise exception 'Final rental amount cannot be negative';end if;
 policy:=case when bid is null then ds.updated_at else (select policy_version from public.booking_deposits where booking_id=bid) end;
 result:=jsonb_build_object('base',q.total_php,'extras',extra,'services',(service->>'totalCentavos')::integer/100,'standard',standard,'adjustment',final-standard,'final',final,'deposit',2500,'policyVersion',policy,'pricing',private.hourly_rental_breakdown(model,starts,ends,false),'delivery',service);
 result:=result||jsonb_build_object('selectedColor',private.normalize_motorcycle_color(p_payload->>'selectedColor'));
 result:=result||jsonb_build_object('token',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
 return result||jsonb_build_object('units',coalesce((select jsonb_agg(to_jsonb(u)||jsonb_build_object('color',private.normalize_motorcycle_color(mu.color))) from private.manual_booking_units(model,starts,ends,bid) u join public.motorcycle_units mu on mu.id=u.id),'[]'::jsonb));
end;$$;

-- Manual booking integration; source: ADMIN prepared migration 039.
create or replace function public.admin_save_manual_booking(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare chosen_color text:=private.normalize_motorcycle_color(p_payload->>'selectedColor'); req uuid:=(p_payload->>'requestId')::uuid; bid uuid:=(p_payload->>'bookingId')::uuid; cid uuid:=(p_payload->>'customerId')::uuid;
 model uuid:=(p_payload->>'modelId')::uuid; unit uuid:=(p_payload->>'unitId')::uuid;
 starts timestamptz:=(p_payload->>'startAt')::timestamptz; ends timestamptz:=(p_payload->>'endAt')::timestamptz;
 v_email text:=nullif(lower(trim(p_payload->>'email')),''); v_phone text:=trim(p_payload->>'phone'); fullname text:=trim(p_payload->>'fullName');
 kind text:=p_payload->>'customerType'; v_source text:=p_payload->>'source'; requested text:=p_payload->>'action';
 fingerprint text:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'); old_req public.admin_booking_requests%rowtype;
 b public.bookings%rowtype; ds public.security_deposit_settings%rowtype; bs public.booking_settings%rowtype;
 q jsonb; svc jsonb; line record; ref text; fresh boolean:=bid is null; actual_revision integer; matches integer; old_full_name text;
begin
 if not private.is_active_admin() then raise exception 'Administrator access required';end if;
 if req is null or unit is null or model is null or fullname is null or length(fullname) not between 2 and 160 or v_phone is null or v_phone !~ '^\+?[0-9][0-9[:space:]()-]{6,24}$' or (v_email is not null and (length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
 or kind is null or kind not in ('philippine_resident','international_visitor') or v_source is null or v_source not in ('whatsapp','phone','walk_in','other') or requested is null or requested not in ('pending','confirmed') or length(coalesce(p_payload->>'notes',''))>2000 then raise exception 'Check the customer, booking source and rental information';end if;
 if requested='confirmed' and length(trim(coalesce(p_payload->>'confirmationReason',''))) not between 5 and 500 then raise exception 'Explicit reservation confirmation reason required';end if;
 perform pg_advisory_xact_lock(hashtextextended(req::text,39));
 select * into old_req from public.admin_booking_requests where request_id=req;
 if found then
  if old_req.actor<>auth.uid() or old_req.fingerprint<>fingerprint then raise exception 'Request key was reused with different details';end if;
  return jsonb_build_object('bookingId',old_req.booking_id);
 end if;
 if not fresh then
  select * into b from public.bookings where id=bid for update;
  select revision into actual_revision from public.booking_admin_details where booking_id=bid for update;
  if actual_revision is null or actual_revision is distinct from (p_payload->>'revision')::integer then raise exception 'Booking changed. Reload before editing';end if;
  if cid is distinct from b.customer_id then raise exception 'Customer reassignment is unavailable; edit the current customer contact details';end if;
  if b.status='confirmed' and requested<>'confirmed' then raise exception 'A confirmed booking cannot be downgraded to pending';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(model::text,0));
 perform pg_advisory_xact_lock(hashtextextended(unit::text,0));
 perform 1 from public.motorcycle_units where id=unit for update;
 if chosen_color is null and exists(select 1 from public.motorcycle_units where motorcycle_model_id=model and archived_at is null and private.normalize_motorcycle_color(color) is not null)
 and (fresh or b.selected_color is not null) then raise exception 'Choose the motorcycle color';end if;
 if chosen_color is not null and not exists(select 1 from public.motorcycle_units where id=unit and motorcycle_model_id=model and private.normalize_motorcycle_color(color)=chosen_color) then
  raise exception 'Assigned unit must match the selected color';end if;
 update public.booking_inventory_holds set released_at=now() where motorcycle_unit_id=unit and released_at is null and converted_at is null and expires_at<=now();
 -- Lock accessories in canonical order, then recompute quote and availability in the same transaction.
 perform 1 from private.calculate_extra_selection(p_payload->'extras',starts,ends,1,true,bid);
 select * into ds from public.security_deposit_settings where id for share;
 select * into bs from public.booking_settings where id for share;
 q:=public.admin_quote_manual_booking(p_payload);
 if q->>'token' is distinct from p_payload->>'quoteToken' or (q->>'final')::integer is distinct from (p_payload->>'expectedTotal')::integer then raise exception 'Price or policy changed. Review a fresh quote';end if;
 if not exists(select 1 from private.manual_booking_units(model,starts,ends,bid) where id=unit) then raise exception 'Selected motorcycle is no longer available';end if;
 select * into ds from public.security_deposit_settings where id for share;
 select * into bs from public.booking_settings where id for share;
 if bs.pending_hold_minutes is null or bs.pending_expiration_minutes is null or bs.pending_hold_minutes<=0 or bs.pending_expiration_minutes<=0 then raise exception 'Pending expiration and inventory hold policies must be configured';end if;
 -- Serialize normalized phone matching. Never silently merge ambiguous customer records.
 perform pg_advisory_xact_lock(hashtextextended(private.manual_phone_key(v_phone),39));
 if v_email is not null then perform pg_advisory_xact_lock(hashtextextended(v_email,39));end if;
 if cid is null then
  select count(*),(array_agg(id))[1] into matches,cid from public.customers where auth_user_id is null and (private.manual_phone_key(customers.phone)=private.manual_phone_key(v_phone) or (v_email is not null and lower(trim(customers.email))=v_email));
  if matches>1 then raise exception 'Multiple customers match this phone. Select the correct existing customer';end if;
  if cid is not null and not exists(select 1 from public.customers where id=cid and lower(trim(full_name))=lower(fullname)) then raise exception 'This phone belongs to an existing customer. Search and select the correct customer';end if;
 end if;
 if cid is not null and not exists(select 1 from public.customers where id=cid and auth_user_id is null) then raise exception 'Select an existing guest customer';end if;
 if cid is not null then
  select full_name into old_full_name from public.customers where id=cid for update;
  if old_full_name is distinct from fullname and (exists(select 1 from public.bookings where customer_id=cid and id is distinct from bid) or exists(select 1 from public.customer_verifications v join public.verification_reviews r on r.verification_id=v.id where v.customer_id=cid and r.result='approved')) then raise exception 'This customer name is bound to other reservations or approved evidence. Use an authorized identity correction before renaming';end if;
 end if;
 if cid is null then
  insert into public.customers(full_name,phone,email,customer_type) values(fullname,v_phone,v_email,kind) returning id into cid;
 else
  -- An edit cannot change another reservation's notification binding (it has its own immutable snapshot).
  update public.customers set full_name=fullname,phone=v_phone,email=v_email,customer_type=kind where id=cid;
 end if;
 if fresh then
  ref:='KJM-'||to_char(now() at time zone 'Asia/Manila','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.bookings(selected_color,booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,base_total_php,extras_total_php,services_total_php,manual_adjustment_php,pricing_daily_rate_php,pricing_units,submitted_at,expires_at,idempotency_key,deposit_required_centavos)
  values(chosen_color,ref,cid,model,starts,ends,'pending',(q->>'final')::integer,(q->>'base')::integer,(q->>'extras')::integer,(q->>'services')::integer,(q->>'adjustment')::integer,(q->'pricing'->>'dailyRatePhp')::integer,(q->'pricing'->>'pricingUnits')::integer,now(),now()+make_interval(mins=>bs.pending_expiration_minutes),req,250000) returning id into bid;
  insert into public.booking_admin_details(booking_id,created_by,source,internal_notes,adjustment,confirmation_reason) values(bid,auth.uid(),v_source,coalesce(p_payload->>'notes',''),p_payload->'adjustment',coalesce(p_payload->>'confirmationReason',''));
  insert into public.customer_verifications(booking_id,customer_id,customer_type,identity_status,license_status,entitlement_status,international_status,overall_status)
  values(bid,cid,kind,'submitted','submitted','under_review',case when kind='international_visitor' then 'under_review' else 'not_applicable' end,'submitted');
  insert into public.booking_deposits(booking_id,option,required_centavos,partial_return_allowed,collection_instructions,return_instructions,dispute_instructions,policy_version,request_fingerprint,is_test)
  values(bid,'cash',250000,ds.partial_cash_return_allowed,ds.collection_instructions,ds.return_instructions,ds.dispute_instructions,ds.updated_at,fingerprint,(select is_test from public.bookings where id=bid));
  insert into public.booking_inventory_holds(booking_id,motorcycle_unit_id,start_at,end_at,expires_at) values(bid,unit,starts,ends,least(now()+make_interval(mins=>bs.pending_hold_minutes),now()+make_interval(mins=>bs.pending_expiration_minutes)));
  insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(bid,null,'pending',auth.uid());
 else
  if exists(select 1 from public.customer_verifications where booking_id=bid and customer_type is distinct from kind) then raise exception 'Customer residency type cannot change after creation; use verification review';end if;
  delete from public.booking_services where booking_id=bid;
  update public.bookings set selected_color=chosen_color,motorcycle_model_id=model,motorcycle_unit_id=case when b.status='confirmed' then unit else null end,start_at=starts,end_at=ends,quoted_total_php=(q->>'final')::integer,base_total_php=(q->>'base')::integer,extras_total_php=(q->>'extras')::integer,services_total_php=(q->>'services')::integer,manual_adjustment_php=(q->>'adjustment')::integer,pricing_daily_rate_php=(q->'pricing'->>'dailyRatePhp')::integer,pricing_units=(q->'pricing'->>'pricingUnits')::integer where id=bid;
  if b.motorcycle_model_id is distinct from model then
   update public.customer_verifications set entitlement_status='under_review',overall_status='under_review',reviewed_by=null,reviewed_at=null where booking_id=bid;
   insert into public.audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'verification.model_change_review_required','booking',bid);
  end if;
  if b.status='pending' then
   -- Editing does not extend the original hold or expiration.
   update public.booking_inventory_holds set motorcycle_unit_id=unit,start_at=starts,end_at=ends where booking_id=bid and released_at is null and converted_at is null and expires_at>now();
   if not found then raise exception 'Pending inventory hold expired; create a fresh reservation';end if;
  end if;
  update public.booking_admin_details set source=v_source,internal_notes=coalesce(p_payload->>'notes',''),adjustment=p_payload->'adjustment',confirmation_reason=coalesce(p_payload->>'confirmationReason',''),revision=revision+1 where booking_id=bid;
  delete from public.booking_extra_items where booking_id=bid;
 end if;
 -- Reuse guest recipient binding with an unissued random hash. No account, password or public access token is created.
 if v_email is null then delete from public.guest_booking_contacts where booking_id=bid;
 else
  insert into public.guest_booking_contacts(booking_id,access_hash,email,request_fingerprint) values(bid,encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),v_email,fingerprint)
  on conflict(booking_id) do update set email=excluded.email,request_fingerprint=excluded.request_fingerprint;
 end if;
 svc:=q->'delivery';
 insert into public.booking_services(booking_id,delivery_area_id,collection_area_id,delivery,collection,delivery_fee_centavos,collection_fee_centavos,payment_method)
 values(bid,(p_payload->'services'->'delivery'->>'areaId')::uuid,(p_payload->'services'->'collection'->>'areaId')::uuid,nullif(svc->'delivery','null'),nullif(svc->'collection','null'),(svc->>'deliveryFeeCentavos')::integer,(svc->>'collectionFeeCentavos')::integer,'cash');
 for line in select * from private.calculate_extra_selection(p_payload->'extras',starts,ends,(q->'pricing'->>'pricingUnits')::integer,false,bid) loop
  insert into public.booking_extra_items(booking_id,extra_id,name_snapshot,price_php_snapshot,quantity,pricing_model_snapshot,charged_units,line_total_centavos) values(bid,line.extra_id,line.name,line.price_php,line.quantity,line.pricing_model,line.charged_units,line.line_total_php*100);
 end loop;
 if requested='confirmed' and (fresh or b.status='pending') then perform private.confirm_manual_booking(bid,unit,p_payload->>'confirmationReason');end if;
 -- Customer emails are skipped naturally when no guest binding/email exists. Staff events remain intact.
 begin
 perform private.enqueue_kjm_notification(bid,case when fresh then 'booking_requested' else 'booking_modified' end,case when fresh then 'request:'||bid else 'manual-edit:'||req end);
 exception when others then
 insert into public.notification_generation_errors(booking_id,source,sql_state,event_type,staff_only) values(bid,'manual_booking',sqlstate,'booking_requested',false);
 end;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),case when fresh then 'booking.manual_created' else 'booking.manual_edited' end,'booking',bid,jsonb_build_object('source',v_source,'standard_php',q->'standard','adjustment',p_payload->'adjustment','final_php',q->'final','old_start',b.start_at,'old_end',b.end_at,'new_start',starts,'new_end',ends,'old_model',b.motorcycle_model_id,'model',model,'old_unit',b.motorcycle_unit_id,'unit',unit,'request_id',req));
 insert into public.admin_booking_requests(request_id,actor,fingerprint,booking_id) values(req,auth.uid(),fingerprint,bid);
 return jsonb_build_object('bookingId',bid);
end;$$;

create function public.admin_quote_manual_booking_with_color(p_payload jsonb) returns jsonb
language sql security definer set search_path='' as $$ select public.admin_quote_manual_booking(p_payload); $$;
create function public.admin_save_manual_booking_with_color(p_payload jsonb) returns jsonb
language sql security definer set search_path='' as $$ select public.admin_save_manual_booking(p_payload); $$;
revoke all on function public.admin_quote_manual_booking_with_color(jsonb), public.admin_save_manual_booking_with_color(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_quote_manual_booking_with_color(jsonb), public.admin_save_manual_booking_with_color(jsonb) to authenticated;

create function private.capture_notification_motorcycle_color() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 new.payload:=new.payload||jsonb_build_object('selectedColor',(select selected_color from public.bookings where id=new.booking_id));
 return new;
end;$$;
revoke all on function private.capture_notification_motorcycle_color() from public,anon,authenticated,service_role;
create trigger notification_outbox_motorcycle_color before insert on public.notification_outbox
for each row execute function private.capture_notification_motorcycle_color();

-- Legacy authenticated submission has no color parameter. Fail closed for
-- configured models, retain the no-color legacy path and existing bookings.
create function private.require_booking_color_selection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.selected_color is null and exists(select 1 from public.motorcycle_units u
  where u.motorcycle_model_id=new.motorcycle_model_id and u.archived_at is null and private.normalize_motorcycle_color(u.color) is not null) then
  raise exception 'Choose your preferred motorcycle color using the current booking form';
 end if;
 return new;
end;$$;
revoke all on function private.require_booking_color_selection() from public,anon,authenticated,service_role;
create trigger bookings_require_color_on_insert before insert on public.bookings
for each row execute function private.require_booking_color_selection();

notify pgrst, 'reload schema';
commit;
