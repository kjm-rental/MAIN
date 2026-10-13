-- Phase 6: quantity-aware extra inventory and provider-neutral payment preparation.
-- No gateway, fees, deposits, credentials, or public-booking activation are included.

alter table public.booking_extras_catalog
  add column image_path text,
  add column pricing_model text not null default 'per_rental' check (pricing_model in ('per_rental','per_day')),
  add column total_quantity integer not null default 1 check (total_quantity >= 0),
  add column max_per_booking integer not null default 1 check (max_per_booking > 0),
  add column is_active boolean not null default false,
  add column price_centavos integer generated always as (price_php * 100) stored;

update public.booking_extras_catalog set is_active=is_available;
alter table public.booking_extras_catalog add constraint booking_extras_quantity_limit_check
check (max_per_booking <= greatest(total_quantity,1));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('booking-extras','booking-extras',true,8388608,array['image/avif','image/webp','image/jpeg','image/png'])
on conflict(id) do nothing;
create policy booking_extras_images_public_read on storage.objects for select to anon,authenticated using(bucket_id='booking-extras');
create policy booking_extras_images_admin_insert on storage.objects for insert to authenticated with check(bucket_id='booking-extras' and (select private.is_active_admin()));
create policy booking_extras_images_admin_update on storage.objects for update to authenticated using(bucket_id='booking-extras' and (select private.is_active_admin())) with check(bucket_id='booking-extras' and (select private.is_active_admin()));
create policy booking_extras_images_admin_delete on storage.objects for delete to authenticated using(bucket_id='booking-extras' and (select private.is_active_admin()));

alter table public.booking_extra_items
  add column quantity integer not null default 1 check (quantity > 0),
  add column pricing_model_snapshot text not null default 'per_rental' check (pricing_model_snapshot in ('per_rental','per_day')),
  add column charged_units integer not null default 1 check (charged_units > 0),
  add column unit_price_centavos_snapshot integer generated always as (price_php_snapshot * 100) stored,
  add column line_total_centavos integer not null default 0 check (line_total_centavos >= 0);
update public.booking_extra_items set line_total_centavos=price_php_snapshot*100;

alter table public.bookings
  add column base_total_centavos integer generated always as (base_total_php * 100) stored,
  add column extras_total_centavos integer generated always as (extras_total_php * 100) stored,
  add column fees_total_centavos integer not null default 0 check (fees_total_centavos >= 0),
  add column deposit_required_centavos integer check (deposit_required_centavos is null or deposit_required_centavos >= 0),
  add column total_centavos integer generated always as (quoted_total_php * 100) stored;

drop policy booking_extras_available_read on public.booking_extras_catalog;
create policy booking_extras_available_read on public.booking_extras_catalog
for select to anon,authenticated using (is_active and is_available and total_quantity > 0);

create or replace function private.calculate_extra_selection(
  p_items jsonb,p_start_at timestamptz,p_end_at timestamptz,p_pricing_units integer,p_lock boolean default false
) returns table(extra_id uuid,name text,price_php integer,pricing_model text,quantity integer,charged_units integer,line_total_php integer)
language plpgsql security definer set search_path='' as $$
declare item jsonb; requested_id uuid; requested_quantity integer; extra public.booking_extras_catalog%rowtype; reserved integer;
begin
  if p_items is null then p_items:='[]'::jsonb; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>20 then raise exception 'Invalid extras selection'; end if;
  if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'id') from jsonb_array_elements(p_items)) then raise exception 'Duplicate extras are not allowed'; end if;
  for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
    requested_id:=(item->>'id')::uuid; requested_quantity:=(item->>'quantity')::integer;
    if p_lock then select * into extra from public.booking_extras_catalog e where e.id=requested_id for update;
    else select * into extra from public.booking_extras_catalog e where e.id=requested_id; end if;
    if extra.id is null or not extra.is_active or not extra.is_available then raise exception 'A selected extra is unavailable'; end if;
    if requested_quantity<1 or requested_quantity>extra.max_per_booking then raise exception 'Selected extra quantity exceeds its booking limit'; end if;
    select coalesce(sum(lines.quantity),0)::integer into reserved
    from public.booking_extra_items lines join public.bookings booking on booking.id=lines.booking_id
    where lines.extra_id=requested_id and booking.status in ('pending','confirmed','active')
      and tstzrange(booking.start_at,booking.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)');
    if reserved+requested_quantity>extra.total_quantity then raise exception 'A selected extra has insufficient inventory'; end if;
    extra_id:=extra.id; name:=extra.name; price_php:=extra.price_php; pricing_model:=extra.pricing_model;
    quantity:=requested_quantity; charged_units:=case when extra.pricing_model='per_day' then p_pricing_units else 1 end;
    line_total_php:=extra.price_php*quantity*charged_units; return next;
  end loop;
end; $$;
revoke all on function private.calculate_extra_selection(jsonb,timestamptz,timestamptz,integer,boolean) from public,anon,authenticated;

create or replace function public.get_booking_quote_v2(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_extra_items jsonb default '[]')
returns table(pricing_units integer,daily_rate_php integer,base_total_centavos integer,extras_total_centavos integer,fees_total_centavos integer,deposit_required_centavos integer,total_centavos integer)
language plpgsql volatile security definer set search_path='' as $$
declare q record; extras_php integer;
begin
  select * into q from private.calculate_booking_quote(p_model_id,p_start_at,p_end_at,true);
  select coalesce(sum(x.line_total_php),0)::integer into extras_php from private.calculate_extra_selection(p_extra_items,p_start_at,p_end_at,q.pricing_units,false) x;
  return query select q.pricing_units,q.daily_rate_php,q.total_php*100,extras_php*100,0,null::integer,(q.total_php+extras_php)*100;
end; $$;
revoke all on function public.get_booking_quote_v2(uuid,timestamptz,timestamptz,jsonb) from public;
grant execute on function public.get_booking_quote_v2(uuid,timestamptz,timestamptz,jsonb) to anon,authenticated;

create or replace function public.submit_booking_request_v2(
  p_idempotency_key uuid,p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_extra_items jsonb,
  p_full_name text,p_email text,p_phone text,p_country text,p_customer_type text,p_identity_name text,p_license_name text,
  p_license_country text,p_license_expiration date,p_vehicle_categories text,p_entry_date date,p_privacy_consent boolean,p_declaration boolean
) returns table(booking_id uuid,booking_reference text,verification_id uuid)
language plpgsql security definer set search_path='' as $$
declare q record; created record; line record; extras_php integer:=0; existing record;
begin
  select b.id booking_id,b.booking_reference,v.id verification_id into existing from public.bookings b join public.customers c on c.id=b.customer_id join public.customer_verifications v on v.booking_id=b.id where b.idempotency_key=p_idempotency_key and c.auth_user_id=auth.uid();
  if found then return query select existing.booking_id,existing.booking_reference,existing.verification_id; return; end if;
  select * into q from private.calculate_booking_quote(p_model_id,p_start_at,p_end_at,true);
  perform 1 from private.calculate_extra_selection(p_extra_items,p_start_at,p_end_at,q.pricing_units,true);
  select * into created from public.submit_booking_request_with_extras(p_idempotency_key,p_model_id,p_start_at,p_end_at,'{}'::uuid[],p_full_name,p_email,p_phone,p_country,p_customer_type,p_identity_name,p_license_name,p_license_country,p_license_expiration,p_vehicle_categories,p_entry_date,p_privacy_consent,p_declaration);
  for line in select * from private.calculate_extra_selection(p_extra_items,p_start_at,p_end_at,q.pricing_units,false) loop
    insert into public.booking_extra_items(booking_id,extra_id,name_snapshot,price_php_snapshot,quantity,pricing_model_snapshot,charged_units,line_total_centavos)
    values(created.booking_id,line.extra_id,line.name,line.price_php,line.quantity,line.pricing_model,line.charged_units,line.line_total_php*100);
    extras_php:=extras_php+line.line_total_php;
  end loop;
  update public.bookings set extras_total_php=extras_php,quoted_total_php=base_total_php+extras_php where id=created.booking_id;
  return query select created.booking_id,created.booking_reference,created.verification_id;
end; $$;
revoke all on function public.submit_booking_request_v2(uuid,uuid,timestamptz,timestamptz,jsonb,text,text,text,text,text,text,text,text,date,text,date,boolean,boolean) from public,anon;
grant execute on function public.submit_booking_request_v2(uuid,uuid,timestamptz,timestamptz,jsonb,text,text,text,text,text,text,text,text,date,text,date,boolean,boolean) to authenticated;

create or replace function public.admin_reschedule_booking(p_booking_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_unit_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.bookings%rowtype; q record; target_unit uuid; line record; reserved integer; extras_php integer:=0;
begin
  if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
  select * into v from public.bookings where id=p_booking_id for update;
  if v.id is null or v.status not in ('confirmed','active') then raise exception 'Only confirmed or active bookings can be rescheduled'; end if;
  if v.status='active' and p_start_at<>v.start_at then raise exception 'An active rental pickup cannot be changed'; end if;
  target_unit:=coalesce(p_unit_id,v.motorcycle_unit_id);
  perform pg_advisory_xact_lock(hashtextextended(target_unit::text,0));
  select * into q from private.calculate_booking_quote(v.motorcycle_model_id,p_start_at,p_end_at,false);
  perform 1 from public.booking_extras_catalog catalog join public.booking_extra_items item on item.extra_id=catalog.id
    where item.booking_id=p_booking_id order by catalog.id for update of catalog;
  for line in select item.*,catalog.total_quantity from public.booking_extra_items item join public.booking_extras_catalog catalog on catalog.id=item.extra_id where item.booking_id=p_booking_id order by item.extra_id loop
    select coalesce(sum(other.quantity),0)::integer into reserved from public.booking_extra_items other join public.bookings booking on booking.id=other.booking_id
      where other.extra_id=line.extra_id and other.booking_id<>p_booking_id and booking.status in ('pending','confirmed','active')
      and tstzrange(booking.start_at,booking.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)');
    if reserved+line.quantity>line.total_quantity then raise exception 'Insufficient extras inventory for the requested schedule'; end if;
    extras_php:=extras_php+line.price_php_snapshot*line.quantity*case when line.pricing_model_snapshot='per_day' then q.pricing_units else 1 end;
  end loop;
  if exists(select 1 from public.bookings b where b.motorcycle_unit_id=target_unit and b.id<>p_booking_id and b.status in ('pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)')) or exists(select 1 from public.booking_inventory_holds h where h.motorcycle_unit_id=target_unit and h.booking_id<>p_booking_id and h.released_at is null and h.converted_at is null and h.expires_at>now() and tstzrange(h.start_at,h.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)')) or exists(select 1 from public.motorcycle_unavailability m where m.motorcycle_unit_id=target_unit and tstzrange(m.start_at,m.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)')) then raise exception 'Requested schedule conflicts with a booking, hold, or maintenance block'; end if;
  update public.booking_extra_items set charged_units=case when pricing_model_snapshot='per_day' then q.pricing_units else 1 end,
    line_total_centavos=unit_price_centavos_snapshot*quantity*case when pricing_model_snapshot='per_day' then q.pricing_units else 1 end where booking_id=p_booking_id;
  update public.bookings set motorcycle_unit_id=target_unit,start_at=p_start_at,end_at=p_end_at,base_total_php=q.total_php,extras_total_php=extras_php,
    quoted_total_php=q.total_php+extras_php,pricing_daily_rate_php=q.daily_rate_php,pricing_units=q.pricing_units where id=p_booking_id;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'booking.rescheduled','booking',p_booking_id,jsonb_build_object('old_start',v.start_at,'old_end',v.end_at,'new_start',p_start_at,'new_end',p_end_at,'unit_id',target_unit));
end; $$;
revoke all on function public.admin_reschedule_booking(uuid,timestamptz,timestamptz,uuid) from public,anon;
grant execute on function public.admin_reschedule_booking(uuid,timestamptz,timestamptz,uuid) to authenticated;

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id) on delete restrict,
  idempotency_key uuid not null unique,kind text not null check(kind in ('charge','refund')),
  amount_centavos integer not null check(amount_centavos>0),currency text not null default 'PHP' check(currency='PHP'),
  status text not null check(status in ('requires_action','processing','succeeded','failed','cancelled')),
  provider text,provider_reference text,request_fingerprint jsonb not null check(jsonb_typeof(request_fingerprint)='object'),is_test boolean not null,
  created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index payment_intents_provider_reference_unique on public.payment_intents(provider,provider_reference) where provider_reference is not null;
create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),payment_intent_id uuid not null references public.payment_intents(id) on delete restrict,
  attempt_number integer not null check(attempt_number>0),status text not null check(status in ('started','succeeded','failed','cancelled')),
  provider_reference text,response_code text,failure_message text,is_test boolean not null,created_at timestamptz not null default now(),completed_at timestamptz,
  unique(payment_intent_id,attempt_number)
);
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),booking_id uuid not null references public.bookings(id) on delete restrict,
  payment_intent_id uuid references public.payment_intents(id) on delete restrict,event_type text not null check(event_type in ('payment','refund','reversal')),
  original_payment_event_id uuid references public.payment_events(id) on delete restrict,
  amount_centavos integer not null check(amount_centavos>0),method text not null check(method in ('cash','bank_transfer','other_offline','future_gateway')),
  transaction_reference text,occurred_at timestamptz not null,recorded_by uuid not null references auth.users(id) on delete restrict,
  internal_notes text,idempotency_key uuid not null unique,is_test boolean not null,created_at timestamptz not null default now(),
  check ((event_type='payment' and original_payment_event_id is null) or (event_type in ('refund','reversal') and original_payment_event_id is not null))
);
create unique index payment_events_reference_unique on public.payment_events(method,transaction_reference) where transaction_reference is not null;
create unique index payment_events_intent_settlement_unique on public.payment_events(payment_intent_id,event_type);
create unique index payment_events_one_reversal_per_payment on public.payment_events(original_payment_event_id) where event_type='reversal';
create index payment_events_booking_created_idx on public.payment_events(booking_id,created_at desc);

alter table public.payment_intents enable row level security; alter table public.payment_intents force row level security;
alter table public.payment_attempts enable row level security; alter table public.payment_attempts force row level security;
alter table public.payment_events enable row level security; alter table public.payment_events force row level security;
revoke all on public.payment_intents,public.payment_attempts,public.payment_events from anon,authenticated;
grant select on public.payment_intents,public.payment_attempts,public.payment_events to authenticated;
create policy payment_intents_admin_read on public.payment_intents for select to authenticated using ((select private.is_active_admin()));
create policy payment_attempts_admin_read on public.payment_attempts for select to authenticated using ((select private.is_active_admin()));
create policy payment_events_admin_read on public.payment_events for select to authenticated using ((select private.is_active_admin()));

create or replace function private.derive_financial_test_provenance() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='payment_attempts' then select is_test into new.is_test from public.payment_intents where id=new.payment_intent_id;
  else select is_test into new.is_test from public.bookings where id=new.booking_id; end if;
  if new.is_test is null then raise exception 'Related financial parent record not found'; end if;
  return new;
end; $$;
revoke all on function private.derive_financial_test_provenance() from public,anon,authenticated;
create trigger payment_intents_test_provenance before insert on public.payment_intents for each row execute function private.derive_financial_test_provenance();
create trigger payment_attempts_test_provenance before insert on public.payment_attempts for each row execute function private.derive_financial_test_provenance();
create trigger payment_events_test_provenance before insert on public.payment_events for each row execute function private.derive_financial_test_provenance();

create or replace function public.admin_record_offline_payment(p_booking_id uuid,p_amount_centavos integer,p_method text,p_transaction_reference text,p_paid_at timestamptz,p_notes text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare intent_id uuid; paid integer; total integer; test_record boolean; existing public.payment_intents%rowtype; fingerprint jsonb;
begin
  if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
  if p_amount_centavos<=0 or p_method not in ('cash','bank_transfer','other_offline') then raise exception 'Invalid offline payment'; end if;
  if p_method='bank_transfer' and length(trim(coalesce(p_transaction_reference,'')))=0 then raise exception 'A verified transfer reference is required'; end if;
  fingerprint:=jsonb_build_object('operation','payment','booking_id',p_booking_id,'amount_centavos',p_amount_centavos,'method',p_method,'transaction_reference',coalesce(trim(p_transaction_reference),''),'occurred_at',p_paid_at);
  select * into existing from public.payment_intents where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_fingerprint<>fingerprint then raise exception 'Idempotency key was reused with different payment parameters'; end if;
    return existing.id;
  end if;
  select total_centavos,is_test into total,test_record from public.bookings where id=p_booking_id for update;
  if total is null then raise exception 'Booking not found'; end if;
  select coalesce(sum(case when event_type='payment' then amount_centavos else -amount_centavos end),0)::integer into paid from public.payment_events where booking_id=p_booking_id;
  if paid+p_amount_centavos>total then raise exception 'Payment exceeds the outstanding balance'; end if;
  insert into public.payment_intents(booking_id,idempotency_key,kind,amount_centavos,status,provider,provider_reference,request_fingerprint,is_test,created_by)
  values(p_booking_id,p_idempotency_key,'charge',p_amount_centavos,'succeeded','offline',nullif(trim(p_transaction_reference),''),fingerprint,test_record,auth.uid()) returning id into intent_id;
  insert into public.payment_attempts(payment_intent_id,attempt_number,status,provider_reference,is_test,completed_at) values(intent_id,1,'succeeded',nullif(trim(p_transaction_reference),''),test_record,now());
  insert into public.payment_events(booking_id,payment_intent_id,event_type,amount_centavos,method,transaction_reference,occurred_at,recorded_by,internal_notes,idempotency_key,is_test)
  values(p_booking_id,intent_id,'payment',p_amount_centavos,p_method,nullif(trim(p_transaction_reference),''),p_paid_at,auth.uid(),nullif(trim(p_notes),''),p_idempotency_key,test_record);
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'payment.offline_recorded','booking',p_booking_id,jsonb_build_object('payment_intent_id',intent_id,'amount_centavos',p_amount_centavos,'method',p_method));
  return intent_id;
exception when unique_violation then
  select * into existing from public.payment_intents where idempotency_key=p_idempotency_key;
  if existing.id is not null and existing.request_fingerprint=fingerprint then return existing.id; end if;
  if existing.id is not null then raise exception 'Idempotency key was reused with different payment parameters'; end if;
  raise exception 'Duplicate payment transaction reference';
end; $$;
revoke all on function public.admin_record_offline_payment(uuid,integer,text,text,timestamptz,text,uuid) from public,anon;
grant execute on function public.admin_record_offline_payment(uuid,integer,text,text,timestamptz,text,uuid) to authenticated;

create or replace function public.admin_record_payment_adjustment(p_original_payment_event_id uuid,p_operation text,p_amount_centavos integer,p_method text,p_transaction_reference text,p_occurred_at timestamptz,p_reason text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare original public.payment_events%rowtype; existing public.payment_intents%rowtype; adjusted integer; intent_id uuid; fingerprint jsonb;
begin
  if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
  if p_operation not in ('refund','reversal') or p_amount_centavos<=0 or p_method not in ('cash','bank_transfer','other_offline') then raise exception 'Invalid financial adjustment'; end if;
  if length(trim(coalesce(p_transaction_reference,'')))=0 or length(trim(coalesce(p_reason,'')))<5 then raise exception 'A transaction reference and clear reason are required'; end if;
  fingerprint:=jsonb_build_object('operation',p_operation,'original_payment_event_id',p_original_payment_event_id,'amount_centavos',p_amount_centavos,'method',p_method,'transaction_reference',trim(p_transaction_reference),'occurred_at',p_occurred_at,'reason',trim(p_reason));
  select * into existing from public.payment_intents where idempotency_key=p_idempotency_key;
  if found then if existing.request_fingerprint<>fingerprint then raise exception 'Idempotency key was reused with different adjustment parameters'; end if; return existing.id; end if;
  select * into original from public.payment_events where id=p_original_payment_event_id and event_type='payment' for update;
  if original.id is null then raise exception 'Original verified payment not found'; end if;
  perform 1 from public.bookings where id=original.booking_id for update;
  select coalesce(sum(amount_centavos),0)::integer into adjusted from public.payment_events where original_payment_event_id=original.id and event_type in ('refund','reversal');
  if adjusted+p_amount_centavos>original.amount_centavos then raise exception 'Adjustment exceeds remaining refundable amount'; end if;
  if p_operation='reversal' and (adjusted<>0 or p_amount_centavos<>original.amount_centavos) then raise exception 'A reversal must correct the full, previously unadjusted payment'; end if;
  insert into public.payment_intents(booking_id,idempotency_key,kind,amount_centavos,status,provider,provider_reference,request_fingerprint,is_test,created_by)
  values(original.booking_id,p_idempotency_key,'refund',p_amount_centavos,'succeeded','offline',trim(p_transaction_reference),fingerprint,original.is_test,auth.uid()) returning id into intent_id;
  insert into public.payment_attempts(payment_intent_id,attempt_number,status,provider_reference,is_test,completed_at) values(intent_id,1,'succeeded',trim(p_transaction_reference),original.is_test,now());
  insert into public.payment_events(booking_id,payment_intent_id,event_type,original_payment_event_id,amount_centavos,method,transaction_reference,occurred_at,recorded_by,internal_notes,idempotency_key,is_test)
  values(original.booking_id,intent_id,p_operation,original.id,p_amount_centavos,p_method,trim(p_transaction_reference),p_occurred_at,auth.uid(),trim(p_reason),p_idempotency_key,original.is_test);
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'payment.'||p_operation||'_recorded','booking',original.booking_id,jsonb_build_object('payment_intent_id',intent_id,'original_payment_event_id',original.id,'amount_centavos',p_amount_centavos,'reason',trim(p_reason)));
  return intent_id;
exception when unique_violation then
  select * into existing from public.payment_intents where idempotency_key=p_idempotency_key;
  if existing.id is not null and existing.request_fingerprint=fingerprint then return existing.id; end if;
  if existing.id is not null then raise exception 'Idempotency key was reused with different adjustment parameters'; end if;
  raise exception 'Duplicate adjustment transaction reference';
end; $$;
revoke all on function public.admin_record_payment_adjustment(uuid,text,integer,text,text,timestamptz,text,uuid) from public,anon;
grant execute on function public.admin_record_payment_adjustment(uuid,text,integer,text,text,timestamptz,text,uuid) to authenticated;

create or replace function private.guard_financial_mutation() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Financial records are immutable'; end if;
  if tg_table_name='payment_intents' then
    if new.booking_id<>old.booking_id or new.idempotency_key<>old.idempotency_key or new.amount_centavos<>old.amount_centavos or new.kind<>old.kind or new.is_test<>old.is_test or new.request_fingerprint<>old.request_fingerprint then raise exception 'Financial identity fields are immutable'; end if;
    if not ((old.status='requires_action' and new.status in ('processing','cancelled')) or (old.status='processing' and new.status in ('succeeded','failed','cancelled')) or old.status=new.status) then raise exception 'Invalid payment intent status transition'; end if;
  elsif tg_table_name='payment_attempts' then
    if new.payment_intent_id<>old.payment_intent_id or new.attempt_number<>old.attempt_number or new.is_test<>old.is_test then raise exception 'Payment attempt identity is immutable'; end if;
    if not ((old.status='started' and new.status in ('succeeded','failed','cancelled')) or old.status=new.status) then raise exception 'Invalid payment attempt status transition'; end if;
  else raise exception 'Financial events are immutable'; end if;
  return new;
end; $$;
revoke all on function private.guard_financial_mutation() from public,anon,authenticated;
create trigger payment_intents_guard before update or delete on public.payment_intents for each row execute function private.guard_financial_mutation();
create trigger payment_attempts_guard before update or delete on public.payment_attempts for each row execute function private.guard_financial_mutation();
create trigger payment_events_guard before update or delete on public.payment_events for each row execute function private.guard_financial_mutation();

create trigger payment_intents_set_updated_at before update on public.payment_intents for each row execute function public.set_updated_at();
comment on table public.payment_intents is 'Provider-neutral payment intent. No gateway is selected or integrated.';
comment on table public.payment_events is 'Immutable verified financial events; customers cannot insert or update these records.';
