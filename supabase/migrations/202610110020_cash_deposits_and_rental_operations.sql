-- Phase 9. PREPARED ONLY: production application requires owner approval.
-- No prices, booking durations, public switch, Auth configuration or existing rows are changed.
create table public.security_deposit_settings (
  id boolean primary key default true check(id),
  cash_enabled boolean not null default false,
  cash_amount_centavos integer check(cash_amount_centavos > 0),
  cash_policy_approved_at timestamptz,
  id_enabled boolean not null default false,
  id_legal_approved_at timestamptz,
  id_legal_reference text not null default '' check(length(id_legal_reference)<=2000),
  accepted_document_types jsonb not null default '[]' check(jsonb_typeof(accepted_document_types)='array'),
  collection_instructions text not null default '' check(length(collection_instructions)<=4000),
  return_instructions text not null default '' check(length(return_instructions)<=4000),
  dispute_instructions text not null default '' check(length(dispute_instructions)<=4000),
  partial_cash_return_allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  check(not cash_enabled or (cash_amount_centavos is not null and cash_policy_approved_at is not null)),
  check(not id_enabled or (id_legal_approved_at is not null and length(trim(id_legal_reference))>0 and jsonb_array_length(accepted_document_types)>0)),
  check(not (cash_enabled or id_enabled) or (length(trim(collection_instructions))>0 and length(trim(return_instructions))>0 and length(trim(dispute_instructions))>0))
);
insert into public.security_deposit_settings(id) values(true);

alter table public.bookings add column rental_workflow_version integer not null default 0;
alter table public.bookings alter column rental_workflow_version set default 9;

create table public.booking_deposits (
  booking_id uuid primary key references public.bookings(id) on delete restrict,
  option text not null check(option in ('cash','eligible_id')),
  required_centavos integer not null check(required_centavos>=0),
  document_type text check(length(document_type)<=120),
  partial_return_allowed boolean not null,
  collection_instructions text not null,
  return_instructions text not null,
  dispute_instructions text not null,
  policy_version timestamptz not null,
  legal_reference text,
  request_fingerprint text not null,
  is_test boolean not null,
  created_at timestamptz not null default now(),
  check((option='cash' and required_centavos>0 and document_type is null) or (option='eligible_id' and required_centavos=0 and document_type is not null and legal_reference is not null and length(trim(document_type))>0 and length(trim(legal_reference))>0))
);
create table public.security_deposit_events (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  booking_id uuid not null references public.booking_deposits(booking_id) on delete restrict,
  event_type text not null check(event_type in ('cash_collected','cash_returned','id_received','id_returned','case_opened','case_resolved')),
  amount_centavos integer not null default 0 check(amount_centavos>=0),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  notes text not null default '' check(length(notes)<=2000),
  idempotency_key uuid not null unique,
  request_fingerprint jsonb not null,
  is_test boolean not null,
  check((event_type in ('cash_collected','cash_returned') and amount_centavos>0) or (event_type not in ('cash_collected','cash_returned') and amount_centavos=0))
);
create index security_deposit_events_booking_idx on public.security_deposit_events(booking_id,recorded_at,id);
create table public.rental_inspections (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  kind text not null check(kind in ('handover','return')),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  odometer_km integer not null check(odometer_km>=0),
  fuel_percent integer not null check(fuel_percent between 0 and 100),
  condition_notes text not null check(length(trim(condition_notes)) between 1 and 2000),
  accessories_notes text not null check(length(trim(accessories_notes)) between 1 and 2000),
  existing_damage_notes text not null default '' check(length(existing_damage_notes)<=2000),
  new_damage_notes text not null default '' check(length(new_damage_notes)<=2000),
  identity_checked boolean not null,
  accessories_checked boolean not null check(accessories_checked),
  idempotency_key uuid not null unique,
  request_fingerprint jsonb not null,
  is_test boolean not null,
  unique(booking_id,kind)
);

-- No direct mutations: all settings, custody and liability changes go through guarded RPCs.
alter table public.security_deposit_settings enable row level security;
alter table public.security_deposit_settings force row level security;
alter table public.booking_deposits enable row level security;
alter table public.booking_deposits force row level security;
alter table public.security_deposit_events enable row level security;
alter table public.security_deposit_events force row level security;
alter table public.rental_inspections enable row level security;
alter table public.rental_inspections force row level security;
revoke all on public.security_deposit_settings,public.booking_deposits,public.security_deposit_events,public.rental_inspections from public,anon,authenticated;
grant select on public.security_deposit_settings,public.booking_deposits,public.security_deposit_events,public.rental_inspections to authenticated;
create policy deposit_settings_admin_read on public.security_deposit_settings for select to authenticated using((select private.is_active_admin()));
create policy deposit_requirement_owner_admin_read on public.booking_deposits for select to authenticated using((select private.is_active_admin()) or exists(select 1 from public.bookings b join public.customers c on c.id=b.customer_id where b.id=booking_id and c.auth_user_id=(select auth.uid())));
create policy deposit_events_admin_read on public.security_deposit_events for select to authenticated using((select private.is_active_admin()));
create policy inspection_admin_read on public.rental_inspections for select to authenticated using((select private.is_active_admin()));

create function private.guard_rental_immutable() returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'Deposit requirements, deposit events and inspections are immutable'; end; $$;
revoke all on function private.guard_rental_immutable() from public,anon,authenticated;
create trigger deposit_requirement_immutable before update or delete on public.booking_deposits for each row execute function private.guard_rental_immutable();
create trigger deposit_event_immutable before update or delete on public.security_deposit_events for each row execute function private.guard_rental_immutable();
create trigger rental_inspection_immutable before update or delete on public.rental_inspections for each row execute function private.guard_rental_immutable();

create function public.admin_save_security_deposit_settings(p_settings jsonb) returns void language plpgsql security definer set search_path='' as $$
declare previous public.security_deposit_settings%rowtype; cash_approved boolean; legal_approved boolean; types jsonb;
begin
  if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
  if p_settings is null or jsonb_typeof(p_settings)<>'object' then raise exception 'Invalid deposit settings'; end if;
  select * into previous from public.security_deposit_settings where id=true for update;
  cash_approved:=coalesce((p_settings->>'cash_policy_approved')::boolean,false);
  legal_approved:=coalesce((p_settings->>'id_legal_approved')::boolean,false);
  types:=coalesce(p_settings->'accepted_document_types','[]');
  if jsonb_typeof(types)<>'array' or jsonb_array_length(types)>20 or exists(select 1 from jsonb_array_elements(types) t where jsonb_typeof(t)<>'string' or length(trim(t#>>'{}')) not between 1 and 120) then raise exception 'Specify exact legally reviewed document types'; end if;
  if (coalesce((p_settings->>'id_enabled')::boolean,false) or legal_approved) and (not legal_approved or jsonb_array_length(types)=0 or length(trim(coalesce(p_settings->>'id_legal_reference','')))=0) then raise exception 'ID custody requires explicit legal approval, review reference and exact document types'; end if;
  update public.security_deposit_settings set
    cash_enabled=coalesce((p_settings->>'cash_enabled')::boolean,false),cash_amount_centavos=nullif(p_settings->>'cash_amount_centavos','')::integer,
    cash_policy_approved_at=case when cash_approved then now() else null end,
    id_enabled=coalesce((p_settings->>'id_enabled')::boolean,false),id_legal_approved_at=case when legal_approved then now() else null end,
    id_legal_reference=trim(coalesce(p_settings->>'id_legal_reference','')),accepted_document_types=types,
    collection_instructions=trim(coalesce(p_settings->>'collection_instructions','')),return_instructions=trim(coalesce(p_settings->>'return_instructions','')),
    dispute_instructions=trim(coalesce(p_settings->>'dispute_instructions','')),partial_cash_return_allowed=coalesce((p_settings->>'partial_cash_return_allowed')::boolean,false),updated_at=clock_timestamp(),updated_by=auth.uid()
  where id=true;
  insert into public.audit_logs(actor_user_id,action,entity_type,metadata) values(auth.uid(),'deposit.settings_changed','security_deposit_settings',jsonb_build_object('before',to_jsonb(previous),'after',(select to_jsonb(s) from public.security_deposit_settings s where id=true)));
end; $$;
revoke all on function public.admin_save_security_deposit_settings(jsonb) from public,anon;
grant execute on function public.admin_save_security_deposit_settings(jsonb) to authenticated;

create function public.get_security_deposit_options() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('cash_enabled',cash_enabled and cash_policy_approved_at is not null,'cash_amount_centavos',case when cash_enabled and cash_policy_approved_at is not null then cash_amount_centavos else null end,
 'id_enabled',id_enabled and id_legal_approved_at is not null,'accepted_document_types',case when id_enabled and id_legal_approved_at is not null then accepted_document_types else '[]'::jsonb end,
 'collection_instructions',case when cash_enabled or id_enabled then collection_instructions else '' end,'return_instructions',case when cash_enabled or id_enabled then return_instructions else '' end,
 'dispute_instructions',case when cash_enabled or id_enabled then dispute_instructions else '' end,'policy_version',updated_at) from public.security_deposit_settings where id=true;
$$;
revoke all on function public.get_security_deposit_options() from public;
grant execute on function public.get_security_deposit_options() to anon,authenticated;

create function public.get_booking_quote_v3(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_extra_items jsonb,p_deposit_option text,p_document_type text default null)
returns table(pricing_units integer,daily_rate_php integer,base_total_centavos integer,extras_total_centavos integer,fees_total_centavos integer,deposit_required_centavos integer,total_centavos integer,cash_due_at_pickup_centavos bigint,policy_version timestamptz)
language plpgsql security definer set search_path='' as $$
declare s public.security_deposit_settings%rowtype; q record; amount integer;
begin
  select * into s from public.security_deposit_settings where id=true;
  if p_deposit_option='cash' and s.cash_enabled and s.cash_policy_approved_at is not null then amount:=s.cash_amount_centavos;
  elsif p_deposit_option='eligible_id' and s.id_enabled and s.id_legal_approved_at is not null and s.accepted_document_types ? p_document_type then amount:=0;
  else raise exception 'Selected security deposit arrangement is not approved and available'; end if;
  select * into q from public.get_booking_quote_v2(p_model_id,p_start_at,p_end_at,p_extra_items);
  return query select q.pricing_units,q.daily_rate_php,q.base_total_centavos,q.extras_total_centavos,q.fees_total_centavos,amount,q.total_centavos,q.total_centavos::bigint+amount,s.updated_at;
end; $$;
revoke all on function public.get_booking_quote_v3(uuid,timestamptz,timestamptz,jsonb,text,text) from public;
grant execute on function public.get_booking_quote_v3(uuid,timestamptz,timestamptz,jsonb,text,text) to anon,authenticated;

-- Reuse Phase 6 submission in the same transaction; legacy entry points cannot bypass required selection.
revoke execute on function public.submit_booking_request_v2(uuid,uuid,timestamptz,timestamptz,jsonb,text,text,text,text,text,text,text,text,date,text,date,boolean,boolean), public.submit_booking_request_with_extras(uuid,uuid,timestamptz,timestamptz,uuid[],text,text,text,text,text,text,text,text,date,text,date,boolean,boolean), public.submit_booking_request(uuid,uuid,timestamptz,timestamptz,text,text,text,text,text,text,text,text,date,text,date,boolean,boolean) from authenticated,anon;

create function public.submit_booking_request_v3(
 p_idempotency_key uuid,p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_extra_items jsonb,
 p_full_name text,p_email text,p_phone text,p_country text,p_customer_type text,p_identity_name text,p_license_name text,p_license_country text,p_license_expiration date,p_vehicle_categories text,p_entry_date date,p_privacy_consent boolean,p_declaration boolean,
 p_deposit_option text,p_policy_version timestamptz,p_document_type text default null
) returns table(booking_id uuid,booking_reference text,verification_id uuid,rental_total_centavos integer,deposit_required_centavos integer,cash_due_at_pickup_centavos bigint)
language plpgsql security definer set search_path='' as $$
declare s public.security_deposit_settings%rowtype; created record; q record; existing record; fingerprint text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or p_privacy_consent is distinct from true or p_declaration is distinct from true then raise exception 'Required declarations and idempotency key are missing'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_model_id,p_start_at,p_end_at,p_extra_items,p_full_name,p_email,p_phone,p_country,p_customer_type,p_identity_name,p_license_name,p_license_country,p_license_expiration,p_vehicle_categories,p_entry_date,p_deposit_option,p_policy_version,p_document_type)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_idempotency_key::text,9));
  select b.id,b.booking_reference,b.total_centavos,v.id verification_id,d.required_centavos,d.request_fingerprint into existing from public.bookings b join public.customers c on c.id=b.customer_id join public.customer_verifications v on v.booking_id=b.id join public.booking_deposits d on d.booking_id=b.id where b.idempotency_key=p_idempotency_key and c.auth_user_id=auth.uid();
  if found then
    if existing.request_fingerprint<>fingerprint then raise exception 'Idempotency key reused with different booking parameters'; end if;
    return query select existing.id,existing.booking_reference,existing.verification_id,existing.total_centavos,existing.required_centavos,existing.total_centavos::bigint+existing.required_centavos; return;
  end if;
  select * into s from public.security_deposit_settings where id=true for share;
  if p_policy_version is distinct from s.updated_at then raise exception 'Deposit policy changed; request a fresh quote before submitting'; end if;
  select * into q from public.get_booking_quote_v3(p_model_id,p_start_at,p_end_at,p_extra_items,p_deposit_option,p_document_type);
  select * into created from public.submit_booking_request_v2(p_idempotency_key,p_model_id,p_start_at,p_end_at,p_extra_items,p_full_name,p_email,p_phone,p_country,p_customer_type,p_identity_name,p_license_name,p_license_country,p_license_expiration,p_vehicle_categories,p_entry_date,p_privacy_consent,p_declaration);
  insert into public.booking_deposits(booking_id,option,required_centavos,document_type,partial_return_allowed,collection_instructions,return_instructions,dispute_instructions,policy_version,legal_reference,request_fingerprint,is_test)
  select created.booking_id,p_deposit_option,q.deposit_required_centavos,case when p_deposit_option='eligible_id' then p_document_type else null end,s.partial_cash_return_allowed,s.collection_instructions,s.return_instructions,s.dispute_instructions,s.updated_at,case when p_deposit_option='eligible_id' then s.id_legal_reference else null end,fingerprint,b.is_test from public.bookings b where b.id=created.booking_id;
  update public.bookings set deposit_required_centavos=q.deposit_required_centavos where id=created.booking_id;
  select b.total_centavos into q.total_centavos from public.bookings b where b.id=created.booking_id;
  return query select created.booking_id,created.booking_reference,created.verification_id,q.total_centavos,q.deposit_required_centavos,q.total_centavos::bigint+q.deposit_required_centavos;
end; $$;
revoke all on function public.submit_booking_request_v3(uuid,uuid,timestamptz,timestamptz,jsonb,text,text,text,text,text,text,text,text,date,text,date,boolean,boolean,text,timestamptz,text) from public,anon;
grant execute on function public.submit_booking_request_v3(uuid,uuid,timestamptz,timestamptz,jsonb,text,text,text,text,text,text,text,text,date,text,date,boolean,boolean,text,timestamptz,text) to authenticated;

create function private.assert_deposit_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.booking_deposits where booking_id=new.id) then raise exception 'A server-approved security deposit snapshot is required'; end if; return null;
end; $$;
revoke all on function private.assert_deposit_snapshot() from public,anon,authenticated;
create constraint trigger require_deposit_snapshot after insert on public.bookings deferrable initially deferred for each row execute function private.assert_deposit_snapshot();

create function public.admin_record_security_deposit_event(p_booking_id uuid,p_event_type text,p_amount_centavos integer,p_occurred_at timestamptz,p_notes text,p_idempotency_key uuid,p_verified boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.booking_deposits%rowtype; b public.bookings%rowtype; existing public.security_deposit_events%rowtype; fingerprint jsonb; collected bigint; returned bigint; custody integer; unresolved boolean; result uuid;
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 if p_verified is distinct from true or p_idempotency_key is null or p_amount_centavos is null or p_occurred_at is null or p_occurred_at>now() or length(coalesce(p_notes,''))>2000 then raise exception 'Verify the physical transaction and provide a valid date and amount'; end if;
 fingerprint:=jsonb_build_object('booking',p_booking_id,'event',p_event_type,'amount',p_amount_centavos,'occurred_at',p_occurred_at,'notes',coalesce(p_notes,''));
 select * into b from public.bookings where id=p_booking_id for update;
 if b.id is null then raise exception 'Booking not found'; end if;
 select * into existing from public.security_deposit_events where idempotency_key=p_idempotency_key;
 if found then if existing.request_fingerprint<>fingerprint then raise exception 'Idempotency key reused with different deposit parameters'; end if; return existing.id; end if;
 select * into d from public.booking_deposits where booking_id=p_booking_id;
 if d.booking_id is null then raise exception 'Legacy booking has no deposit snapshot; do not invent a requirement'; end if;
 select coalesce(sum(amount_centavos) filter(where event_type='cash_collected'),0),coalesce(sum(amount_centavos) filter(where event_type='cash_returned'),0),coalesce(sum(case event_type when 'id_received' then 1 when 'id_returned' then -1 else 0 end),0)::integer into collected,returned,custody from public.security_deposit_events where booking_id=p_booking_id;
 select coalesce((select event_type='case_opened' from public.security_deposit_events where booking_id=p_booking_id and event_type in ('case_opened','case_resolved') order by sequence desc limit 1),false) into unresolved;
 if p_event_type='cash_collected' then
   if d.option<>'cash' or b.status<>'confirmed' or collected<>0 or p_amount_centavos<>d.required_centavos then raise exception 'Collect the quoted cash deposit once for a confirmed booking'; end if;
 elsif p_event_type='cash_returned' then
   if d.option<>'cash' or b.status not in ('active','completed','cancelled') or p_amount_centavos<=0 or p_amount_centavos>collected-returned then raise exception 'Deposit return exceeds cash held or rental state does not permit return'; end if;
   if b.status='active' and not exists(select 1 from public.rental_inspections where booking_id=p_booking_id and kind='return') then raise exception 'Return inspection is required before returning a rental deposit'; end if;
   if not d.partial_return_allowed and p_amount_centavos<>collected-returned then raise exception 'Partial deposit returns are not permitted by the quoted policy'; end if;
 elsif p_event_type='id_received' then
   if d.option<>'eligible_id' or b.status<>'confirmed' or custody<>0 or exists(select 1 from public.security_deposit_events where booking_id=p_booking_id and event_type='id_received') or p_amount_centavos<>0 then raise exception 'Receive the legally approved document once at pickup'; end if;
 elsif p_event_type='id_returned' then
   if b.status='active' and not exists(select 1 from public.rental_inspections where booking_id=p_booking_id and kind='return') then raise exception 'Return inspection is required before returning a custody document'; end if;
   if d.option<>'eligible_id' or b.status not in ('active','completed','cancelled') or custody<>1 or p_amount_centavos<>0 then raise exception 'No permitted document is in custody or return is not allowed'; end if;
 elsif p_event_type in ('case_opened','case_resolved') then
   if p_amount_centavos<>0 or length(trim(coalesce(p_notes,'')))<5 or (p_event_type='case_opened' and unresolved) or (p_event_type='case_resolved' and not unresolved) then raise exception 'Specify a new, meaningful deposit resolution reason'; end if;
   if p_event_type='case_resolved' and (collected>returned or custody>0) then raise exception 'Return the cash or document before resolving the case; deductions are not supported'; end if;
 else raise exception 'Invalid deposit event'; end if;
 insert into public.security_deposit_events(booking_id,event_type,amount_centavos,occurred_at,recorded_by,notes,idempotency_key,request_fingerprint,is_test) values(p_booking_id,p_event_type,p_amount_centavos,p_occurred_at,auth.uid(),coalesce(p_notes,''),p_idempotency_key,fingerprint,b.is_test) returning id into result;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'deposit.'||p_event_type,'booking',p_booking_id,jsonb_build_object('event_id',result,'amount_centavos',p_amount_centavos));
 return result;
end; $$;
revoke all on function public.admin_record_security_deposit_event(uuid,text,integer,timestamptz,text,uuid,boolean) from public,anon;
grant execute on function public.admin_record_security_deposit_event(uuid,text,integer,timestamptz,text,uuid,boolean) to authenticated;

-- Cash-only applies to new rental receipts, not historical records or legitimate corrections.
create function private.assert_cash_rental_receipt() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.event_type='payment' and new.method<>'cash' then raise exception 'Rental payments are cash on pickup only'; end if; return new; end; $$;
revoke all on function private.assert_cash_rental_receipt() from public,anon,authenticated;
create trigger cash_only_rental_receipts before insert on public.payment_events for each row execute function private.assert_cash_rental_receipt();

-- Save the return inspection separately so staff can physically return the deposit before completion.
create function public.admin_record_rental_inspection(p_booking_id uuid,p_kind text,p_details jsonb,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; previous public.rental_inspections%rowtype; fingerprint jsonb; actual timestamptz; result uuid; before_odometer integer;
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 if b.id is null or p_details is null or jsonb_typeof(p_details)<>'object' or p_idempotency_key is null then raise exception 'Invalid rental inspection'; end if;
 fingerprint:=jsonb_build_object('booking',p_booking_id,'kind',p_kind,'details',p_details);
 select * into previous from public.rental_inspections where idempotency_key=p_idempotency_key;
 if found then if previous.request_fingerprint<>fingerprint then raise exception 'Idempotency key reused with different inspection parameters'; end if; return previous.id; end if;
 if not ((p_kind='handover' and b.status='confirmed') or (p_kind='return' and b.status='active')) then raise exception 'Inspection is not allowed for this rental state'; end if;
 actual:=(p_details->>'occurred_at')::timestamptz;
 if actual is null or actual>now() or (p_kind='return' and actual<b.handover_at) then raise exception 'Invalid actual inspection time'; end if;
 if p_kind='handover' and (p_details->>'identity_checked')::boolean is distinct from true then raise exception 'Recheck customer identity and driving eligibility before handover'; end if;
 select odometer_km into before_odometer from public.rental_inspections where booking_id=p_booking_id and kind='handover';
 if p_kind='return' and (p_details->>'odometer_km')::integer<before_odometer then raise exception 'Return odometer cannot be below the handover reading'; end if;
 insert into public.rental_inspections(booking_id,kind,occurred_at,recorded_by,odometer_km,fuel_percent,condition_notes,accessories_notes,existing_damage_notes,new_damage_notes,identity_checked,accessories_checked,idempotency_key,request_fingerprint,is_test)
 values(p_booking_id,p_kind,actual,auth.uid(),(p_details->>'odometer_km')::integer,(p_details->>'fuel_percent')::integer,p_details->>'condition_notes',p_details->>'accessories_notes',coalesce(p_details->>'existing_damage_notes',''),coalesce(p_details->>'new_damage_notes',''),coalesce((p_details->>'identity_checked')::boolean,false),(p_details->>'accessories_checked')::boolean,p_idempotency_key,fingerprint,b.is_test) returning id into result;
 if p_kind='handover' then perform public.admin_transition_booking_with_reason(p_booking_id,'active',null); end if;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'rental.'||p_kind||'_inspection','booking',p_booking_id,jsonb_build_object('inspection_id',result));
 return result;
end; $$;
revoke all on function public.admin_record_rental_inspection(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.admin_record_rental_inspection(uuid,text,jsonb,uuid) to authenticated;

create function private.guard_rental_workflow() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.booking_deposits%rowtype; x public.customer_verifications%rowtype; paid bigint; held bigint; custody integer; unresolved boolean;
begin
 if tg_op='INSERT' then
   if new.status<>'pending' then raise exception 'New booking requests must start pending'; end if;
   new.rental_workflow_version:=9; return new; end if;
 if new.rental_workflow_version<>old.rental_workflow_version then raise exception 'Rental workflow version is immutable'; end if;
 select * into d from public.booking_deposits where booking_id=new.id;
 if d.booking_id is not null and new.deposit_required_centavos is distinct from d.required_centavos then raise exception 'Quoted deposit requirement is immutable'; end if;
 if new.status is not distinct from old.status or old.rental_workflow_version<>9 then return new; end if;
 if not ((old.status in ('submitted','pending') and new.status in ('confirmed','rejected','cancelled','expired')) or (old.status='confirmed' and new.status in ('active','cancelled')) or (old.status='active' and new.status='completed')) then raise exception 'Invalid rental workflow transition'; end if;
 if new.status='confirmed' then
   if old.expires_at is not null and old.expires_at<=now() then raise exception 'Expired booking cannot be confirmed'; end if;
   if new.motorcycle_unit_id is null then raise exception 'Assigned motorcycle is required'; end if;
   perform pg_advisory_xact_lock(hashtextextended(new.motorcycle_unit_id::text,0));
   if not exists(select 1 from public.motorcycle_units where id=new.motorcycle_unit_id and motorcycle_model_id=new.motorcycle_model_id and status='available' and archived_at is null) then raise exception 'Selected unit is unavailable'; end if;
   if exists(select 1 from public.bookings b where b.motorcycle_unit_id=new.motorcycle_unit_id and b.id<>new.id and b.status in ('pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(new.start_at,new.end_at,'[)')) or exists(select 1 from public.booking_inventory_holds h where h.motorcycle_unit_id=new.motorcycle_unit_id and h.booking_id<>new.id and h.released_at is null and h.converted_at is null and h.expires_at>now() and tstzrange(h.start_at,h.end_at,'[)')&&tstzrange(new.start_at,new.end_at,'[)')) or exists(select 1 from public.motorcycle_unavailability m where m.motorcycle_unit_id=new.motorcycle_unit_id and tstzrange(m.start_at,m.end_at,'[)')&&tstzrange(new.start_at,new.end_at,'[)')) then raise exception 'Selected unit conflicts with a booking, hold or maintenance block'; end if;
 end if;
 if new.status in ('confirmed','active') then
   select * into x from public.customer_verifications where booking_id=new.id;
   if x.id is null or x.overall_status<>'approved' or x.identity_status<>'approved' or x.license_status<>'approved' or x.entitlement_status<>'approved' or x.international_status not in ('approved','not_applicable') or x.license_expiration_date is null or x.license_expiration_date<(now() at time zone 'Asia/Manila')::date then raise exception 'Every mandatory verification check and current licence is required'; end if;
   if not exists(select 1 from public.verification_documents where booking_id=new.id and document_kind='drivers_license_front') or not exists(select 1 from public.verification_documents where booking_id=new.id and document_kind=case when x.customer_type='international_visitor' then 'passport' else 'government_id' end) then raise exception 'Required private verification documents are missing'; end if;
 end if;
 if new.status='active' then
   select occurred_at into new.handover_at from public.rental_inspections where booking_id=new.id and kind='handover';
   if d.booking_id is null or new.motorcycle_unit_id is null or not exists(select 1 from public.rental_inspections where booking_id=new.id and kind='handover') then raise exception 'Assigned motorcycle and handover inspection are required'; end if;
   perform pg_advisory_xact_lock(hashtextextended(new.motorcycle_unit_id::text,0));
   if exists(select 1 from public.bookings where motorcycle_unit_id=new.motorcycle_unit_id and id<>new.id and status='active') then raise exception 'This physical motorcycle is already handed over'; end if;
   select coalesce(sum(case event_type when 'payment' then amount_centavos else -amount_centavos end),0) into paid from public.payment_events where booking_id=new.id;
   if paid<(round(new.quoted_total_php * 100))::bigint then raise exception 'Verified cash rental payment must cover the rental balance before handover'; end if;
 end if;
 if new.status='completed' then select occurred_at into new.returned_at from public.rental_inspections where booking_id=new.id and kind='return'; end if;
 if new.status in ('active','completed') then
   select coalesce(sum(case event_type when 'cash_collected' then amount_centavos when 'cash_returned' then -amount_centavos else 0 end),0),coalesce(sum(case event_type when 'id_received' then 1 when 'id_returned' then -1 else 0 end),0)::integer into held,custody from public.security_deposit_events where booking_id=new.id;
   select coalesce((select event_type='case_opened' from public.security_deposit_events where booking_id=new.id and event_type in ('case_opened','case_resolved') order by sequence desc limit 1),false) into unresolved;
   if new.status='active' and (unresolved or (d.option='cash' and held<>d.required_centavos) or (d.option='eligible_id' and custody<>1)) then raise exception 'The quoted security deposit arrangement must be received and resolved before handover'; end if;
   if new.status='completed' and (not exists(select 1 from public.rental_inspections where booking_id=new.id and kind='return') or ((held>0 or custody>0) and not unresolved)) then raise exception 'Return inspection and deposit return or an explicit unresolved case are required'; end if;
 end if;
 return new;
end; $$;
revoke all on function private.guard_rental_workflow() from public,anon,authenticated;
create trigger guard_rental_workflow before insert or update on public.bookings for each row execute function private.guard_rental_workflow();

create function public.get_booking_deposit_summary(p_booking_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not (private.is_active_admin() or exists(select 1 from public.bookings b join public.customers c on c.id=b.customer_id where b.id=p_booking_id and c.auth_user_id=auth.uid())) then raise exception 'Booking ownership or administrator authorization required'; end if;
 select jsonb_build_object('option',d.option,'required_centavos',d.required_centavos,'document_type',d.document_type,'collection_instructions',d.collection_instructions,'return_instructions',d.return_instructions,'dispute_instructions',d.dispute_instructions,
 'rental_paid_centavos',coalesce((select sum(case event_type when 'payment' then amount_centavos else -amount_centavos end) from public.payment_events where booking_id=d.booking_id),0),
 'cash_collected_centavos',coalesce((select sum(amount_centavos) from public.security_deposit_events where booking_id=d.booking_id and event_type='cash_collected'),0),
 'cash_held_centavos',coalesce((select sum(case event_type when 'cash_collected' then amount_centavos when 'cash_returned' then -amount_centavos else 0 end) from public.security_deposit_events where booking_id=d.booking_id),0),
 'id_in_custody',coalesce((select sum(case event_type when 'id_received' then 1 when 'id_returned' then -1 else 0 end) from public.security_deposit_events where booking_id=d.booking_id),0)>0,
 'unresolved',coalesce((select event_type='case_opened' from public.security_deposit_events where booking_id=d.booking_id and event_type in ('case_opened','case_resolved') order by sequence desc limit 1),false)) into result from public.booking_deposits d where d.booking_id=p_booking_id;
 return result;
end; $$;
revoke all on function public.get_booking_deposit_summary(uuid) from public,anon;
grant execute on function public.get_booking_deposit_summary(uuid) to authenticated;
