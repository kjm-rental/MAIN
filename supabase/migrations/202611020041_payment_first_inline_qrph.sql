-- Payment-first QRPh reservations and inline QR rendering support. Existing receipts remain immutable.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
do $$
declare matched integer;
begin
 with expected(schema_name,function_name,body_hash) as (values
 ('public','finalize_guest_booking_request','b22d7743a817c4c41fc6c7816ae086a0'),
 ('private','guard_rental_workflow','1c48ccdd7eef66c3176615e9492f5820'),
 ('public','prepare_paymongo_guest_checkout','22bbae67f5db1df79cbb27b7ea3f8b16'),
 ('public','prepare_paymongo_live_checkout','79d0f3526600efda181d35a6ea22e5fe'),
 ('public','claim_paymongo_live_creation','6125a44fb2c50e6d321412353a8f53b0'),
 ('public','read_paymongo_live_checkout','36261e331b2fc0f6d3c5bc21b3be4cec'),
 ('public','settle_paymongo_live_checkout','d7afbd8f13e073a88631a52ef1bf1959'))
 select count(*) into matched from expected e join pg_namespace n on n.nspname=e.schema_name
 join pg_proc p on p.pronamespace=n.oid and p.proname=e.function_name
 where md5(p.prosrc)=e.body_hash and p.proconfig @> array['search_path=""'];
 if matched<>7 then raise exception 'Payment-first migration source mismatch';end if;
end;$$;
alter table public.bookings add column payment_before_confirmation boolean not null default false;
alter table public.paymongo_live_checkouts add column provider_intent_id text unique check(provider_intent_id ~ '^pi_[A-Za-z0-9]+$'), add column qr_creation_claimed_at timestamptz;
create or replace function public.finalize_guest_booking_request(p_booking_id uuid,p_access_hash text,p_terms_version text,p_terms_accepted boolean)
returns table(booking_status text,verification_status text) language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; v public.customer_verifications%rowtype; h public.booking_inventory_holds%rowtype; t public.rental_terms_versions%rowtype; accepted public.booking_terms_acceptances%rowtype; c public.customers%rowtype; settings public.booking_settings%rowtype;
begin
 if auth.role() is distinct from 'service_role' or p_terms_accepted is distinct from true then raise exception 'Server authorization and terms acceptance required'; end if;
 select booking.* into b from public.bookings booking join public.guest_booking_contacts guest on guest.booking_id=booking.id where booking.id=p_booking_id and guest.access_hash=p_access_hash for update of booking;
 if b.id is null then raise exception 'Booking not found'; end if;
 select * into v from public.customer_verifications where booking_id=b.id for update;
 select * into accepted from public.booking_terms_acceptances where booking_id=b.id;
 if found then
  if accepted.terms_version is distinct from p_terms_version then raise exception 'Accepted terms version is immutable'; end if;
  return query select b.status,v.overall_status;return;
 end if;
 select * into settings from public.booking_settings where id=true;
 if not coalesce((settings.public_booking_enabled and settings.policies_approved_at is not null),false) then raise exception 'Online booking is not enabled for this session'; end if;
 if b.status not in ('pending','submitted') or b.expires_at is null or b.expires_at<=now() then raise exception 'Request expired or is not pending'; end if;
 select * into t from public.rental_terms_versions where version=p_terms_version and is_current;
 if t.version is null then raise exception 'Review the current Terms and Conditions before submitting'; end if;
 select * into c from public.customers where id=b.customer_id;
 if length(trim(coalesce(c.full_name,''))) not between 2 and 160 or coalesce(c.phone,'') !~ '^\+?[0-9][0-9[:space:]()-]{6,24}$' or length(trim(coalesce(c.country_of_residence,''))) not between 2 and 100 or length(trim(coalesce(v.license_issuing_country,'')))=0 or coalesce(c.email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or v.license_expiration_date is null or v.license_expiration_date<(now() at time zone 'Asia/Manila')::date or length(trim(coalesce(v.identity_name,'')))=0 or length(trim(coalesce(v.license_name,'')))=0 or length(trim(coalesce(v.permitted_vehicle_categories,'')))=0 or v.privacy_consent_at is null or v.customer_declaration_at is null then raise exception 'Required booking information is invalid'; end if;
 if v.overall_status in ('rejected','resubmission_required') then raise exception 'Documents require correction before reservation confirmation'; end if;
 -- Registered metadata must refer to an actual matching private object.
 if not exists(select 1 from public.verification_documents d join storage.objects o on o.name=d.storage_path and o.bucket_id='identity-verification' where d.booking_id=b.id and d.verification_id=v.id and d.owner_user_id is null and d.storage_path like 'guest/'||b.id::text||'/%' and d.document_kind='drivers_license_front' and d.replaced_at is null and d.status not in ('rejected','resubmission_required') and d.mime_type=o.metadata->>'mimetype' and d.size_bytes=(o.metadata->>'size')::integer)
 or not exists(select 1 from public.verification_documents d join storage.objects o on o.name=d.storage_path and o.bucket_id='identity-verification' where d.booking_id=b.id and d.verification_id=v.id and d.owner_user_id is null and d.storage_path like 'guest/'||b.id::text||'/%' and d.document_kind=case when v.customer_type='international_visitor' then 'passport' else 'government_id' end and d.replaced_at is null and d.status not in ('rejected','resubmission_required') and d.mime_type=o.metadata->>'mimetype' and d.size_bytes=(o.metadata->>'size')::integer) then raise exception 'Required private documents are missing'; end if;
 select * into h from public.booking_inventory_holds where booking_id=b.id and released_at is null and converted_at is null and expires_at>now() for update;
 if h.id is null or h.start_at<>b.start_at or h.end_at<>b.end_at then raise exception 'Inventory hold expired; choose another available period'; end if;
 perform pg_advisory_xact_lock(hashtextextended(b.motorcycle_model_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended(h.motorcycle_unit_id::text,0));
 -- Existing unit must still be eligible; the normal confirmation guard also checks overlaps/maintenance.
 if not exists(select 1 from public.motorcycle_units where id=h.motorcycle_unit_id and motorcycle_model_id=b.motorcycle_model_id and status='available' and archived_at is null) then raise exception 'Reserved motorcycle is no longer available'; end if;
 insert into public.booking_terms_acceptances(booking_id,auth_user_id,terms_version,source_sha256) values(b.id,null,t.version,t.source_sha256);
 -- QRPh reserves the slot but never confirms an unpaid booking.
 if exists(select 1 from public.booking_services where booking_id=b.id and payment_method='qrph') then
  update public.bookings set payment_before_confirmation=true,motorcycle_unit_id=h.motorcycle_unit_id,
    expires_at=least(b.start_at,now()+interval '30 minutes') where id=b.id;
  update public.booking_inventory_holds set expires_at=least(b.start_at,now()+interval '30 minutes') where id=h.id;
  if v.customer_type='philippine_resident' then
   insert into public.booking_confirmation_records(booking_id,motorcycle_unit_id,auth_user_id) values(b.id,h.motorcycle_unit_id,null);
  end if;
  booking_status:='pending';
 elsif v.customer_type='philippine_resident' then
  insert into public.booking_confirmation_records(booking_id,motorcycle_unit_id,auth_user_id) values(b.id,h.motorcycle_unit_id,null);
  update public.bookings set status='confirmed',motorcycle_unit_id=h.motorcycle_unit_id,expires_at=null where id=b.id;
  update public.booking_inventory_holds set converted_at=now() where id=h.id;
  insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(b.id,b.status,'confirmed',null);
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(null,'booking.auto_confirmed','booking',b.id,jsonb_build_object('unit_id',h.motorcycle_unit_id,'terms_version',t.version,'verification_pending',true));
  booking_status:='confirmed';
 else booking_status:=b.status;
 end if;
 verification_status:=v.overall_status;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(null,'booking.terms_accepted','booking',b.id,jsonb_build_object('version',t.version,'source_sha256',t.source_sha256));
 return next;
end; $$;
create or replace function public.prepare_paymongo_guest_checkout(p_booking_id uuid,p_access_hash text,p_idempotency_key uuid)
returns public.paymongo_live_checkouts language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; previous public.paymongo_live_checkouts%rowtype; owner_id uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server authorization required';end if;
 if not exists(select 1 from public.guest_booking_contacts where booking_id=p_booking_id and access_hash=p_access_hash) then raise exception 'Guest booking unavailable';end if;
 if not exists(select 1 from public.delivery_settings where qrph_enabled) or not public.paymongo_live_ready() then raise exception 'Verified QRPh is unavailable';end if;
 if not exists(select 1 from public.booking_services where booking_id=p_booking_id and payment_method='qrph') then raise exception 'Booking did not select QRPh';end if;
 if not exists(select 1 from public.paymongo_live_settings where enabled) then raise exception 'PayMongo live checkout is disabled'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 select auth_user_id into owner_id from public.customers where id=b.customer_id;
 if b.id is null or b.is_test is distinct from false or owner_id is not null or p_idempotency_key is null then raise exception 'Owned live booking required'; end if;
 select * into previous from public.paymongo_live_checkouts where booking_id=b.id;
 if found then
  if previous.idempotency_key is distinct from p_idempotency_key then raise exception 'Checkout already exists; reconcile existing intent'; end if;
  return previous;
 end if;
 if not (b.status='confirmed' or (b.status='pending' and b.payment_before_confirmation)) or b.motorcycle_unit_id is null or b.end_at<=now() or (b.expires_at is not null and b.expires_at<=now())
 or not exists(select 1 from public.booking_terms_acceptances where booking_id=b.id)
 or not exists(select 1 from public.booking_deposits where booking_id=b.id)
 then raise exception 'Finalized, confirmed, reserved live booking required'; end if;
 if exists(select 1 from public.payment_intents where booking_id=b.id and status in ('requires_action','processing','succeeded'))
 or exists(select 1 from public.payment_events where booking_id=b.id) then raise exception 'Existing rental payment prevents online checkout'; end if;
 insert into public.paymongo_live_checkouts(booking_id,customer_user_id,idempotency_key,amount_centavos,motorcycle_unit_id,start_at,end_at,checkout_deadline)
 values(b.id,null,p_idempotency_key,round(b.quoted_total_php*100)::bigint,b.motorcycle_unit_id,b.start_at,b.end_at,least(now()+interval '30 minutes',b.end_at,coalesce(b.expires_at,b.end_at))) returning * into previous;
 return previous;
end; $$;
create or replace function public.prepare_paymongo_live_checkout(p_booking_id uuid,p_owner uuid,p_idempotency_key uuid)
returns public.paymongo_live_checkouts language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; previous public.paymongo_live_checkouts%rowtype; owner_id uuid;
begin
 if not exists(select 1 from public.paymongo_live_settings where enabled) then raise exception 'PayMongo live checkout is disabled'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 select auth_user_id into owner_id from public.customers where id=b.customer_id;
 if b.id is null or b.is_test is distinct from false or p_owner is null or owner_id is distinct from p_owner or p_idempotency_key is null then raise exception 'Owned live booking required'; end if;
 select * into previous from public.paymongo_live_checkouts where booking_id=b.id;
 if found then
  if previous.idempotency_key is distinct from p_idempotency_key then raise exception 'Checkout already exists; reconcile existing intent'; end if;
  return previous;
 end if;
 if not (b.status='confirmed' or (b.status='pending' and b.payment_before_confirmation)) or b.motorcycle_unit_id is null or b.end_at<=now() or (b.expires_at is not null and b.expires_at<=now())
 or not exists(select 1 from public.booking_terms_acceptances where booking_id=b.id)
 or not exists(select 1 from public.booking_deposits where booking_id=b.id)
 then raise exception 'Finalized, confirmed, reserved live booking required'; end if;
 if exists(select 1 from public.payment_intents where booking_id=b.id and status in ('requires_action','processing','succeeded'))
 or exists(select 1 from public.payment_events where booking_id=b.id) then raise exception 'Existing rental payment prevents online checkout'; end if;
 insert into public.paymongo_live_checkouts(booking_id,customer_user_id,idempotency_key,amount_centavos,motorcycle_unit_id,start_at,end_at,checkout_deadline)
 values(b.id,p_owner,p_idempotency_key,round(b.quoted_total_php*100)::bigint,b.motorcycle_unit_id,b.start_at,b.end_at,least(now()+interval '30 minutes',b.end_at,coalesce(b.expires_at,b.end_at))) returning * into previous;
 return previous;
end; $$;
create or replace function public.claim_paymongo_live_creation(p_checkout_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare booking uuid; b public.bookings%rowtype; c public.paymongo_live_checkouts%rowtype;
begin
 if not exists(select 1 from public.paymongo_live_settings where enabled) then raise exception 'PayMongo disabled'; end if;
 select booking_id into booking from public.paymongo_live_checkouts where id=p_checkout_id;
 select * into b from public.bookings where id=booking for update;
 select * into c from public.paymongo_live_checkouts where id=p_checkout_id for update;
 if c.id is null or b.is_test is distinct from false or not (b.status='confirmed' or (b.status='pending' and b.payment_before_confirmation)) or b.end_at<=now()
 or (b.expires_at is not null and b.expires_at<=now()) or c.checkout_deadline<=now() then raise exception 'Reservation no longer payable'; end if;
 if c.creation_claimed_at is not null or c.checkout_session_id is not null then return false; end if;
 update public.paymongo_live_checkouts set creation_claimed_at=now() where id=c.id;
 return true;
end; $$;
create or replace function public.read_paymongo_live_checkout(p_checkout_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(c)||jsonb_build_object('booking_status',(select status from public.bookings where id=c.booking_id),'reservation_active',not b.is_test and (b.status='confirmed' or (b.status='pending' and b.payment_before_confirmation))
 and b.motorcycle_unit_id=c.motorcycle_unit_id and b.start_at=c.start_at and b.end_at=c.end_at
 and round(b.quoted_total_php*100)::bigint=c.amount_centavos and b.end_at>now()
 and (b.expires_at is null or b.expires_at>now()))
 from public.paymongo_live_checkouts c join public.bookings b on b.id=c.booking_id where c.id=p_checkout_id;
$$;
create or replace function public.settle_paymongo_live_checkout(p_session_id text,p_payment_id text,p_amount_centavos bigint,p_currency text,p_livemode boolean)
returns text language plpgsql security definer set search_path='' as $$
declare c public.paymongo_live_checkouts%rowtype; b public.bookings%rowtype; r public.paymongo_live_receipts%rowtype; booking uuid; result text;
begin
 select booking_id into booking from public.paymongo_live_checkouts where checkout_session_id=p_session_id;
 select * into b from public.bookings where id=booking for update;
 select * into c from public.paymongo_live_checkouts where booking_id=booking for update;
 if c.id is null or p_livemode is distinct from true or p_currency is distinct from 'PHP' or p_amount_centavos is distinct from c.amount_centavos or p_payment_id is null or p_payment_id !~ '^pay_[A-Za-z0-9]+$' then raise exception 'Invalid verified live receipt'; end if;
 select * into r from public.paymongo_live_receipts where checkout_id=c.id;
 if found then
  if r.payment_id<>p_payment_id then raise exception 'Different payment already settled; investigate duplicate'; end if;
  return c.status;
 end if;
 result:=case when not b.is_test and (b.status='confirmed' or (b.status='pending' and b.payment_before_confirmation)) and b.motorcycle_unit_id=c.motorcycle_unit_id
  and b.start_at=c.start_at and b.end_at=c.end_at and round(b.quoted_total_php*100)::bigint=c.amount_centavos
  and now()<c.checkout_deadline and b.end_at>now() and (b.expires_at is null or b.expires_at>now())
  then 'paid' else 'review_required' end;
 insert into public.paymongo_live_receipts(checkout_id,payment_id,amount_centavos,currency,livemode) values(c.id,p_payment_id,p_amount_centavos,p_currency,p_livemode);
 if result='paid' then
  insert into public.payment_intents(id,booking_id,idempotency_key,kind,amount_centavos,status,provider,provider_reference,request_fingerprint,is_test,created_by)
  values(c.id,c.booking_id,c.id,'charge',c.amount_centavos::integer,'succeeded','paymongo',p_payment_id,jsonb_build_object('checkout_session_id',p_session_id,'livemode',true),false,c.customer_user_id);
  insert into public.payment_attempts(payment_intent_id,attempt_number,status,provider_reference,is_test,completed_at)
  values(c.id,1,'succeeded',p_payment_id,false,now());
  insert into public.payment_events(booking_id,payment_intent_id,event_type,amount_centavos,method,transaction_reference,occurred_at,recorded_by,idempotency_key,is_test)
  values(c.booking_id,c.id,'payment',c.amount_centavos::integer,'future_gateway',p_payment_id,now(),c.customer_user_id,c.id,false);
 end if;
 update public.paymongo_live_checkouts set status=result where id=c.id;
 -- Confirm a timely, reserved domestic request only after the verified ledger credit.
 if result='paid' and b.status='pending' and b.payment_before_confirmation then
  if exists(select 1 from public.customer_verifications where booking_id=b.id and customer_type='philippine_resident' and overall_status not in ('rejected','resubmission_required'))
   and exists(select 1 from public.booking_confirmation_records where booking_id=b.id and motorcycle_unit_id=b.motorcycle_unit_id) then
   update public.bookings set status='confirmed',expires_at=null where id=b.id;
   update public.booking_inventory_holds set converted_at=now() where booking_id=b.id and released_at is null and converted_at is null;
   insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(b.id,b.status,'confirmed',c.customer_user_id);
   insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(c.customer_user_id,'booking.confirmed_after_payment','booking',b.id,jsonb_build_object('checkout_id',c.id));
  else
   -- Paid international/manual-review requests retain their reservation for owner review.
   update public.bookings set expires_at=null where id=b.id;
  end if;
 end if;
 return result;
end; $$;
create or replace function private.guard_rental_workflow() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.booking_deposits%rowtype; x public.customer_verifications%rowtype; paid bigint; held bigint; custody integer; unresolved boolean;
begin
 if tg_op='INSERT' then
   if new.status<>'pending' then raise exception 'New booking requests must start pending'; end if;
   new.rental_workflow_version:=9; return new; end if;
 if new.rental_workflow_version<>old.rental_workflow_version then raise exception 'Rental workflow version is immutable'; end if;
 -- A service-verified unpaid legacy reservation can be reclassified without changing its snapshot.
 if old.status='confirmed' and new.status='pending' and new.payment_before_confirmation and not old.payment_before_confirmation
 and exists(select 1 from public.paymongo_live_checkouts c where c.booking_id=old.id and c.status in ('prepared','session_created') and c.provider_status in ('pending','failed_unpaid') and c.provider_checked_at>now()-interval '2 minutes' and c.checkout_deadline>now())
 and not exists(select 1 from public.payment_events where booking_id=old.id)
 and not exists(select 1 from public.paymongo_live_receipts r join public.paymongo_live_checkouts c on c.id=r.checkout_id where c.booking_id=old.id)
 then return new;end if;
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
 if new.status='active' or (new.status='confirmed' and not exists(select 1 from public.booking_confirmation_records r where r.booking_id=new.id and r.motorcycle_unit_id=new.motorcycle_unit_id)) then
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
   select coalesce(sum(case event_type when 'cash_collected' then amount_centavos when 'cash_returned' then -amount_centavos when 'cash_deducted' then -amount_centavos else 0 end),0),coalesce(sum(case event_type when 'id_received' then 1 when 'id_returned' then -1 else 0 end),0)::integer into held,custody from public.security_deposit_events where booking_id=new.id;
   select coalesce((select event_type='case_opened' from public.security_deposit_events where booking_id=new.id and event_type in ('case_opened','case_resolved') order by sequence desc limit 1),false) into unresolved;
   if new.status='active' and (unresolved or (d.option='cash' and held<>d.required_centavos) or (d.option='eligible_id' and custody<>1)) then raise exception 'The quoted security deposit arrangement must be received and resolved before handover'; end if;
   if new.status='completed' and (not exists(select 1 from public.rental_inspections where booking_id=new.id and kind='return') or ((held>0 or custody>0) and not unresolved)) then raise exception 'Return inspection and deposit return or an explicit unresolved case are required'; end if;
 end if;
 return new;
end; $$;

create function private.require_qrph_payment_before_confirmation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='confirmed' and old.status is distinct from 'confirmed'
 and (new.payment_before_confirmation or exists(select 1 from public.booking_services where booking_id=new.id and payment_method='qrph'))
 and not exists(select 1 from public.paymongo_live_checkouts c join public.paymongo_live_receipts r on r.checkout_id=c.id
   join public.payment_events e on e.payment_intent_id=c.id and e.event_type='payment' and e.transaction_reference=r.payment_id
   where c.booking_id=new.id and c.status='paid' and r.livemode and r.amount_centavos=round(new.quoted_total_php*100) and e.amount_centavos=r.amount_centavos)
 then raise exception 'Verified online payment is required before QRPh booking confirmation';end if;
 return new;
end;$$;
revoke all on function private.require_qrph_payment_before_confirmation() from public,anon,authenticated,service_role;
create trigger payment_before_booking_confirmation before update of status on public.bookings for each row execute function private.require_qrph_payment_before_confirmation();
create function public.bind_paymongo_inline_intent(p_checkout_id uuid,p_intent_id text) returns void language plpgsql security definer set search_path='' as $$
declare c public.paymongo_live_checkouts%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server authorization required';end if;
 select * into c from public.paymongo_live_checkouts where id=p_checkout_id for update;
 if c.id is null or c.checkout_session_id is null or p_intent_id is null or p_intent_id !~ '^pi_[A-Za-z0-9]+$' then raise exception 'Invalid payment intent';end if;
 if c.provider_intent_id is not null and c.provider_intent_id<>p_intent_id then raise exception 'Payment intent identity is immutable';end if;
 update public.paymongo_live_checkouts set provider_intent_id=p_intent_id where id=c.id;
end;$$;
create function public.claim_paymongo_qr_generation(p_checkout_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server authorization required';end if;
 update public.paymongo_live_checkouts set qr_creation_claimed_at=now() where id=p_checkout_id and provider_intent_id is not null and qr_creation_claimed_at is null and status='session_created' and checkout_deadline>now();
 return found;
end;$$;
create function public.find_paymongo_inline_checkout(p_intent_id text) returns uuid language sql stable security definer set search_path='' as $$select id from public.paymongo_live_checkouts where provider_intent_id=p_intent_id;$$;
revoke all on function public.bind_paymongo_inline_intent(uuid,text),public.claim_paymongo_qr_generation(uuid),public.find_paymongo_inline_checkout(text) from public,anon,authenticated;
grant execute on function public.bind_paymongo_inline_intent(uuid,text),public.claim_paymongo_qr_generation(uuid),public.find_paymongo_inline_checkout(text) to service_role;
create function public.mark_paymongo_live_awaiting_payment(p_checkout_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.paymongo_live_checkouts%rowtype;b public.bookings%rowtype;bid uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server authorization required';end if;
 select booking_id into bid from public.paymongo_live_checkouts where id=p_checkout_id;
 select * into b from public.bookings where id=bid for update;
 select * into c from public.paymongo_live_checkouts where id=p_checkout_id for update;
 if b.status='confirmed' and not b.payment_before_confirmation and c.status in ('prepared','session_created') and c.provider_status in ('pending','failed_unpaid') and c.provider_checked_at>now()-interval '2 minutes' and c.checkout_deadline>now()
 and exists(select 1 from public.booking_services where booking_id=b.id and payment_method='qrph')
 and not exists(select 1 from public.payment_events where booking_id=b.id) and not exists(select 1 from public.paymongo_live_receipts where checkout_id=c.id)
 then
  update public.bookings set payment_before_confirmation=true,status='pending',expires_at=c.checkout_deadline where id=b.id;
  insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(b.id,'confirmed','pending',null);
  insert into public.audit_logs(action,entity_type,entity_id,metadata) values('booking.awaiting_online_payment','booking',b.id,jsonb_build_object('checkout_id',c.id));
 end if;
end;$$;
revoke all on function public.mark_paymongo_live_awaiting_payment(uuid) from public,anon,authenticated;
grant execute on function public.mark_paymongo_live_awaiting_payment(uuid) to service_role;
commit;
