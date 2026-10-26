-- REVIEW REQUIRED. NOT EXECUTED. Requires migrations through 035.
-- Existing ledgers only; no historical rows, pricing, decisions or notification settings are changed.
begin;
alter table public.security_deposit_events drop constraint security_deposit_events_event_type_check;
alter table public.security_deposit_events drop constraint security_deposit_events_check;
alter table public.security_deposit_events add constraint security_deposit_events_event_type_check check(event_type in ('cash_collected','cash_returned','cash_deducted','id_received','id_returned','case_opened','case_resolved'));
alter table public.security_deposit_events add constraint security_deposit_events_check check((event_type in ('cash_collected','cash_returned','cash_deducted') and amount_centavos>0) or (event_type not in ('cash_collected','cash_returned','cash_deducted') and amount_centavos=0));
-- cash_deducted is an explicit authorized decision, never a cash refund or rental receipt.
create or replace function public.admin_record_security_deposit_event(p_booking_id uuid,p_event_type text,p_amount_centavos integer,p_occurred_at timestamptz,p_notes text,p_idempotency_key uuid,p_verified boolean)
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
 select coalesce(sum(amount_centavos) filter(where event_type='cash_collected'),0),coalesce(sum(amount_centavos) filter(where event_type in ('cash_returned','cash_deducted')),0),coalesce(sum(case event_type when 'id_received' then 1 when 'id_returned' then -1 else 0 end),0)::integer into collected,returned,custody from public.security_deposit_events where booking_id=p_booking_id;
 select coalesce((select event_type='case_opened' from public.security_deposit_events where booking_id=p_booking_id and event_type in ('case_opened','case_resolved') order by sequence desc limit 1),false) into unresolved;
 if p_event_type='cash_collected' then
   if d.option<>'cash' or b.status<>'confirmed' or collected<>0 or p_amount_centavos<>d.required_centavos then raise exception 'Collect the quoted cash deposit once for a confirmed booking'; end if;
 elsif p_event_type='cash_returned' then
   if d.option<>'cash' or b.status not in ('active','completed','cancelled') or p_amount_centavos<=0 or p_amount_centavos>collected-returned then raise exception 'Deposit return exceeds cash held or rental state does not permit return'; end if;
   if b.status='active' and not exists(select 1 from public.rental_inspections where booking_id=p_booking_id and kind='return') then raise exception 'Return inspection is required before returning a rental deposit'; end if;
   if not d.partial_return_allowed and p_amount_centavos<>collected-returned then raise exception 'Partial deposit returns are not permitted by the quoted policy'; end if;
 elsif p_event_type='cash_deducted' then
   if d.option<>'cash' or b.status not in ('active','completed') or p_amount_centavos<=0 or p_amount_centavos>collected-returned or length(trim(coalesce(p_notes,'')))<5
   or not exists(select 1 from public.rental_inspections where booking_id=p_booking_id and kind='return') then raise exception 'A recorded return inspection, available deposit and explicit approved deduction reason are required'; end if;
 elsif p_event_type='id_received' then
   if d.option<>'eligible_id' or b.status<>'confirmed' or custody<>0 or exists(select 1 from public.security_deposit_events where booking_id=p_booking_id and event_type='id_received') or p_amount_centavos<>0 then raise exception 'Receive the legally approved document once at pickup'; end if;
 elsif p_event_type='id_returned' then
   if b.status='active' and not exists(select 1 from public.rental_inspections where booking_id=p_booking_id and kind='return') then raise exception 'Return inspection is required before returning a custody document'; end if;
   if d.option<>'eligible_id' or b.status not in ('active','completed','cancelled') or custody<>1 or p_amount_centavos<>0 then raise exception 'No permitted document is in custody or return is not allowed'; end if;
 elsif p_event_type in ('case_opened','case_resolved') then
   if p_amount_centavos<>0 or length(trim(coalesce(p_notes,'')))<5 or (p_event_type='case_opened' and unresolved) or (p_event_type='case_resolved' and not unresolved) then raise exception 'Specify a new, meaningful deposit resolution reason'; end if;
   if p_event_type='case_resolved' and (collected>returned or custody>0) then raise exception 'Return the cash or document before resolving the case; settle the remaining deposit liability first'; end if;
 else raise exception 'Invalid deposit event'; end if;
 insert into public.security_deposit_events(booking_id,event_type,amount_centavos,occurred_at,recorded_by,notes,idempotency_key,request_fingerprint,is_test) values(p_booking_id,p_event_type,p_amount_centavos,p_occurred_at,auth.uid(),coalesce(p_notes,''),p_idempotency_key,fingerprint,b.is_test) returning id into result;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'deposit.'||p_event_type,'booking',p_booking_id,jsonb_build_object('event_id',result,'amount_centavos',p_amount_centavos));
 return result;
end; $$;
create or replace function private.guard_rental_workflow() returns trigger language plpgsql security definer set search_path='' as $$
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
create or replace function public.get_booking_deposit_summary(p_booking_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not (private.is_active_admin() or exists(select 1 from public.bookings b join public.customers c on c.id=b.customer_id where b.id=p_booking_id and c.auth_user_id=auth.uid())) then raise exception 'Booking ownership or administrator authorization required'; end if;
 select jsonb_build_object('option',d.option,'required_centavos',d.required_centavos,'document_type',d.document_type,'collection_instructions',d.collection_instructions,'return_instructions',d.return_instructions,'dispute_instructions',d.dispute_instructions,
 'rental_paid_centavos',coalesce((select sum(case event_type when 'payment' then amount_centavos else -amount_centavos end) from public.payment_events where booking_id=d.booking_id),0),
 'cash_collected_centavos',coalesce((select sum(amount_centavos) from public.security_deposit_events where booking_id=d.booking_id and event_type='cash_collected'),0),
 'cash_held_centavos',coalesce((select sum(case event_type when 'cash_collected' then amount_centavos when 'cash_returned' then -amount_centavos when 'cash_deducted' then -amount_centavos else 0 end) from public.security_deposit_events where booking_id=d.booking_id),0),
 'id_in_custody',coalesce((select sum(case event_type when 'id_received' then 1 when 'id_returned' then -1 else 0 end) from public.security_deposit_events where booking_id=d.booking_id),0)>0,
 'unresolved',coalesce((select event_type='case_opened' from public.security_deposit_events where booking_id=d.booking_id and event_type in ('case_opened','case_resolved') order by sequence desc limit 1),false)) into result from public.booking_deposits d where d.booking_id=p_booking_id;
 return result;
end; $$;
create or replace function private.guard_identity_handover() returns trigger
language plpgsql security definer set search_path='' as $$
declare v public.customer_verifications%rowtype; d public.booking_deposits%rowtype; paid bigint; held bigint; custody integer; latest_upload timestamptz; component text;
begin
 if new.status<>'active' or old.status='active' then return new; end if;
 if old.status<>'confirmed' or new.start_at>=new.end_at or now()>=new.end_at then raise exception 'Valid confirmed booking required for handover'; end if;
 select * into v from public.customer_verifications where booking_id=new.id for update;
 if v.id is null or v.overall_status<>'approved' or v.identity_status<>'approved' or v.license_status<>'approved'
 or v.entitlement_status<>'approved' or v.international_status not in ('approved','not_applicable')
 or (v.customer_type='international_visitor' and v.international_status<>'approved')
 or v.license_expiration_date is null or v.license_expiration_date<greatest((now() at time zone 'Asia/Manila')::date,(new.start_at at time zone 'Asia/Manila')::date)
 then raise exception 'Genuine current identity and motorcycle license approval required'; end if;
 select max(created_at) into latest_upload from public.verification_documents where verification_id=v.id;
 foreach component in array array['identity','license','entitlement','international'] loop
  if component='international' and v.customer_type<>'international_visitor' then continue; end if;
  if not exists(select 1 from public.verification_reviews r where r.verification_id=v.id and r.review_type=component
    and r.result='approved' and r.created_at>=latest_upload
    and not exists(select 1 from public.verification_reviews later where later.verification_id=v.id and later.review_type=component and later.created_at>r.created_at)) then
   raise exception 'Fresh recorded component reviews required after document changes';
  end if;
 end loop;
 if not exists(select 1 from public.verification_documents where verification_id=v.id and replaced_at is null and status='approved' and document_kind='drivers_license_front')
 or not exists(select 1 from public.verification_documents where verification_id=v.id and replaced_at is null and status='approved' and document_kind=case when v.customer_type='international_visitor' then 'passport' else 'government_id' end)
 or exists(select 1 from public.verification_documents where verification_id=v.id and replaced_at is null and status in ('rejected','resubmission_required')) then raise exception 'Current documents must be reviewed before release'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.motorcycle_unit_id::text,0));
 if new.motorcycle_unit_id is null or not exists(select 1 from public.motorcycle_units where id=new.motorcycle_unit_id and motorcycle_model_id=new.motorcycle_model_id and status='available' and archived_at is null)
 or exists(select 1 from public.motorcycle_unavailability where motorcycle_unit_id=new.motorcycle_unit_id and tstzrange(start_at,end_at,'[)')&&tstzrange(new.start_at,new.end_at,'[)'))
 or exists(select 1 from public.bookings where id<>new.id and motorcycle_unit_id=new.motorcycle_unit_id and status in ('confirmed','active') and tstzrange(start_at,end_at,'[)')&&tstzrange(new.start_at,new.end_at,'[)')) then raise exception 'Assigned motorcycle must be ready and conflict free'; end if;
 if not exists(select 1 from public.rental_inspections where booking_id=new.id and kind='handover' and identity_checked and accessories_checked and is_test=new.is_test) then raise exception 'Recorded handover inspection required'; end if;
 select coalesce(sum(case event_type when 'payment' then amount_centavos else -amount_centavos end),0) into paid from public.payment_events where booking_id=new.id;
 if paid<round(new.quoted_total_php*100)::bigint then raise exception 'Recorded rental payment required'; end if;
 select * into d from public.booking_deposits where booking_id=new.id;
 select coalesce(sum(case event_type when 'cash_collected' then amount_centavos when 'cash_returned' then -amount_centavos when 'cash_deducted' then -amount_centavos else 0 end),0),coalesce(sum(case event_type when 'id_received' then 1 when 'id_returned' then -1 else 0 end),0)::integer into held,custody from public.security_deposit_events where booking_id=new.id;
 if d.booking_id is null or d.option not in ('cash','eligible_id') or (d.option='cash' and held<>d.required_centavos) or (d.option='eligible_id' and custody<>1)
 or coalesce((select event_type='case_opened' from public.security_deposit_events where booking_id=new.id and event_type in ('case_opened','case_resolved') order by sequence desc limit 1),false) then raise exception 'Recorded resolved deposit arrangement required'; end if;
 return new;
end; $$;

-- Atomic normal-operation wrapper. The displayed amount must still match the locked ledger.
create function public.admin_confirm_rental_cash_operation(p_booking_id uuid,p_operation text,p_expected_centavos integer,p_idempotency_key uuid,p_confirmed boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; d public.booking_deposits%rowtype; prior_payment public.payment_intents%rowtype; prior_deposit public.security_deposit_events%rowtype; paid bigint; collected bigint; refunded bigint; deducted bigint; amount bigint; event_kind text;
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 if p_confirmed is distinct from true or p_expected_centavos is null or p_expected_centavos<=0 or p_idempotency_key is null or p_operation is null or p_operation not in ('rental_payment','deposit_collection','deposit_refund') then raise exception 'Confirm actual cash receipt or return'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 if b.id is null then raise exception 'Booking not found'; end if;
 if p_operation='rental_payment' then
  select * into prior_payment from public.payment_intents where idempotency_key=p_idempotency_key;
  if found then
   if prior_payment.booking_id<>b.id or prior_payment.amount_centavos<>p_expected_centavos or prior_payment.request_fingerprint->>'operation'<>'payment' or prior_payment.request_fingerprint->>'method'<>'cash' then raise exception 'Request mismatch'; end if;
   return prior_payment.id;
  end if;
  if b.status in ('cancelled','rejected','expired') then raise exception 'Rental payment unavailable for this booking'; end if;
  select coalesce(sum(case when event_type='payment' then amount_centavos else -amount_centavos end),0) into paid from public.payment_events where booking_id=b.id;
  amount:=greatest(0,b.total_centavos-paid);
  if amount<=0 or amount<>p_expected_centavos then raise exception 'Balance changed; refresh before confirming receipt'; end if;
  return public.admin_record_offline_payment(b.id,amount::integer,'cash',null,now(),null,p_idempotency_key);
 end if;
 event_kind:=case p_operation when 'deposit_collection' then 'cash_collected' else 'cash_returned' end;
 select * into prior_deposit from public.security_deposit_events where idempotency_key=p_idempotency_key;
 if found then
  if prior_deposit.booking_id<>b.id or prior_deposit.event_type<>event_kind or prior_deposit.amount_centavos<>p_expected_centavos then raise exception 'Request mismatch'; end if;
  return prior_deposit.id;
 end if;
 select * into d from public.booking_deposits where booking_id=b.id;
 if d.booking_id is null or d.option<>'cash' then raise exception 'No cash deposit requirement'; end if;
 select coalesce(sum(amount_centavos) filter(where event_type='cash_collected'),0),coalesce(sum(amount_centavos) filter(where event_type='cash_returned'),0),coalesce(sum(amount_centavos) filter(where event_type='cash_deducted'),0) into collected,refunded,deducted from public.security_deposit_events where booking_id=b.id;
 if p_operation='deposit_collection' then
  if collected<>0 then raise exception 'Deposit already collected'; end if;
  amount:=d.required_centavos;
 else
  if b.status not in ('active','completed') or not exists(select 1 from public.rental_inspections where booking_id=b.id and kind='return') then raise exception 'Motorcycle return inspection required'; end if;
  amount:=collected-refunded-deducted;
 end if;
 if amount<=0 or amount<>p_expected_centavos then raise exception 'Deposit balance changed; refresh before confirming'; end if;
 return public.admin_record_security_deposit_event(b.id,event_kind,amount::integer,now(),'Administrator confirmed physical cash',p_idempotency_key,true);
end; $$;
revoke all on function public.admin_confirm_rental_cash_operation(uuid,text,integer,uuid,boolean) from public,anon;
grant execute on function public.admin_confirm_rental_cash_operation(uuid,text,integer,uuid,boolean) to authenticated;
commit;
