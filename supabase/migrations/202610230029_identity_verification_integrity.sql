-- TEST-approved only. Production application is not authorized. Requires 020, 022 and 023.
-- Includes only the notification helper definitions needed here, not migration 027 in full.
-- No historical updates, booking confirmation changes, payments or delivery activation.
begin;
do $$ begin
 if to_regprocedure('public.finalize_booking_request(uuid,text,boolean)') is null
 or to_regprocedure('public.admin_record_rental_inspection(uuid,text,jsonb,uuid)') is null
 or to_regclass('public.notification_generation_errors') is null
 or to_regclass('public.notification_outbox') is null
 then raise exception '029 prerequisite structures missing'; end if;
end $$;
create or replace function private.enqueue_kjm_notification(p_booking uuid,p_event text,p_key text,p_amount integer default null,p_staff_only boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; d public.booking_deposits%rowtype; customer_auth uuid; content jsonb; ch text; admin_event text;
begin
 select * into b from public.bookings where id=p_booking;
 if b.id is null then return; end if;
 select * into d from public.booking_deposits where booking_id=b.id;
 select auth_user_id into customer_auth from public.customers where id=b.customer_id;
 content:=jsonb_build_object('bookingId',b.id,'reference',b.booking_reference,'motorcycle',coalesce((select display_name from public.motorcycle_models where id=b.motorcycle_model_id),'Motorcycle'),
 'pickupAt',b.start_at,'returnAt',b.end_at,'rentalCentavos',b.total_centavos,'depositOption',coalesce(d.option,'unconfirmed'),
 'depositCentavos',d.required_centavos,'amountCentavos',p_amount,'status',b.status,'verificationStatus',(select overall_status from public.customer_verifications where booking_id=b.id));
 foreach ch in array array['telegram','resend'] loop
  if ch='resend' and (p_staff_only or customer_auth is null) then continue; end if;
  insert into public.notification_outbox(event_key,booking_id,booking_reference,event_type,channel,recipient_reference,payload,is_test)
  values(p_key,b.id,b.booking_reference,p_event,ch,case when ch='telegram' then 'operations' else customer_auth::text end,content,b.is_test)
  on conflict(event_key,channel,recipient_reference) do nothing;
 end loop;
 admin_event:=case p_event when 'booking_requested' then 'admin_booking_requested' when 'booking_cancelled' then 'admin_booking_cancelled' when 'booking_modified' then 'admin_booking_modified' when 'pickup_reminder' then 'admin_pickup_reminder' when 'return_reminder' then 'admin_return_reminder' when 'overdue' then 'admin_overdue' when 'verification_review' then 'admin_verification_review' when 'verification_action' then 'admin_manual_review' when 'verification_rejected' then 'admin_manual_review' when 'verification_manual_review' then 'admin_manual_review' else null end;
 if admin_event is not null then
  insert into public.notification_outbox(event_key,booking_id,booking_reference,event_type,channel,recipient_reference,payload,is_test)
  values(p_key,b.id,b.booking_reference,admin_event,'resend','operations',content,b.is_test)
  on conflict(event_key,channel,recipient_reference) do nothing;
 end if;
end; $$;


alter policy verification_documents_owner_insert on public.verification_documents
with check (
  owner_user_id = (select auth.uid())
  and status = 'submitted'
  and replaced_at is null
  and storage_path like (select auth.uid())::text || '/' || booking_id::text || '/%'
  and exists (
    select 1
    from public.customer_verifications verification
    join public.bookings booking on booking.id = verification.booking_id
    join public.customers customer on customer.id = booking.customer_id
    where verification.id = verification_documents.verification_id
      and verification.booking_id = verification_documents.booking_id
      and customer.auth_user_id = (select auth.uid())
      and booking.status in ('submitted', 'pending')
      and (booking.expires_at is null or booking.expires_at > now())
  )
  and exists (
    select 1 from storage.objects object
    where object.bucket_id = 'identity-verification'
      and object.name = verification_documents.storage_path
      and (storage.foldername(object.name))[1] = (select auth.uid())::text
      and object.metadata->>'mimetype' = verification_documents.mime_type
      and (object.metadata->>'size')::integer = verification_documents.size_bytes
  )
);

-- Defense in depth, including privileged metadata inserts. Approval is a review decision.
create function private.guard_verification_document_metadata() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; v public.customer_verifications%rowtype;
begin
 if tg_op='UPDATE' and new.replaced_at is not distinct from old.replaced_at then
  if new.id is distinct from old.id or new.verification_id is distinct from old.verification_id or new.booking_id is distinct from old.booking_id or new.owner_user_id is distinct from old.owner_user_id or new.document_kind is distinct from old.document_kind or new.storage_path is distinct from old.storage_path or new.mime_type is distinct from old.mime_type or new.size_bytes is distinct from old.size_bytes or new.created_at is distinct from old.created_at then raise exception 'Document metadata is immutable; register a replacement'; end if;
  return new;
 end if;
 select * into b from public.bookings where id=new.booking_id for update;
 select * into v from public.customer_verifications where id=new.verification_id and booking_id=b.id for update;
 if v.id is null then raise exception 'Invalid verification binding'; end if;
 if tg_op='INSERT' then
  new.created_at:=now();
  if new.status is distinct from 'submitted' or new.replaced_at is not null then raise exception 'New uploads cannot contain verification decisions'; end if;
  if not private.is_active_admin() and v.overall_status in ('approved','rejected') then raise exception 'Existing verification decision requires authorized review'; end if;
 elsif new.id is distinct from old.id or new.verification_id is distinct from old.verification_id or new.booking_id is distinct from old.booking_id
   or new.owner_user_id is distinct from old.owner_user_id or new.document_kind is distinct from old.document_kind
   or new.storage_path is distinct from old.storage_path or new.mime_type is distinct from old.mime_type
   or new.size_bytes is distinct from old.size_bytes or new.created_at is distinct from old.created_at
   or (old.replaced_at is not null and new.replaced_at is distinct from old.replaced_at) then
  raise exception 'Document metadata is immutable; register a replacement';
 end if;
 return new;
end; $$;
create trigger verification_metadata_integrity before insert or update on public.verification_documents
for each row execute function private.guard_verification_document_metadata();

-- Any new/replaced evidence invalidates earlier component decisions, never history.
create function private.invalidate_verification_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.replaced_at is not distinct from old.replaced_at then return new; end if;
 update public.customer_verifications set
  identity_status=case when exists(select 1 from public.verification_documents where verification_id=new.verification_id and replaced_at is null and status='resubmission_required' and document_kind in ('government_id','passport')) then 'resubmission_required' else 'submitted' end,
  license_status=case when exists(select 1 from public.verification_documents where verification_id=new.verification_id and replaced_at is null and status='resubmission_required' and document_kind in ('drivers_license_front','drivers_license_back')) then 'resubmission_required' else 'submitted' end,
  entitlement_status=case when exists(select 1 from public.verification_documents where verification_id=new.verification_id and replaced_at is null and status='resubmission_required' and document_kind='supporting_document') then 'resubmission_required' else 'under_review' end,
  international_status=case when customer_type<>'international_visitor' then 'not_applicable' when exists(select 1 from public.verification_documents where verification_id=new.verification_id and replaced_at is null and status='resubmission_required' and document_kind='international_driving_permit') then 'resubmission_required' else 'under_review' end,
  overall_status=case when exists(select 1 from public.verification_documents where verification_id=new.verification_id and replaced_at is null and status='resubmission_required') then 'resubmission_required' else 'under_review' end,reviewed_by=null,reviewed_at=null
 where id=new.verification_id;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'verification.evidence_changed','customer_verification',new.verification_id,jsonb_build_object('document_id',new.id));
 return new;
end; $$;
create trigger verification_evidence_changed after insert or update of replaced_at on public.verification_documents
for each row execute function private.invalidate_verification_evidence();

-- Owner updates remain forbidden by RLS; only active staff may raise decisions.
create function private.guard_verification_decisions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.identity_status='approved' and old.identity_status is distinct from 'approved')
 or (new.license_status='approved' and old.license_status is distinct from 'approved')
 or (new.entitlement_status='approved' and old.entitlement_status is distinct from 'approved')
 or (new.international_status='approved' and old.international_status is distinct from 'approved')
 or (new.overall_status='approved' and old.overall_status is distinct from 'approved') then
  if not private.is_active_admin() then raise exception 'Authorized identity review required'; end if;
 end if;
 if new.overall_status='approved' then
  if new.identity_status<>'approved' or new.license_status<>'approved' or new.entitlement_status<>'approved'
   or (new.customer_type='international_visitor' and new.international_status<>'approved')
   or new.international_status not in ('approved','not_applicable') or new.reviewed_by is null
   or new.license_expiration_date is null or new.license_expiration_date<(now() at time zone 'Asia/Manila')::date
   or not exists(select 1 from public.verification_documents where verification_id=new.id and replaced_at is null and status='approved' and document_kind='drivers_license_front')
   or not exists(select 1 from public.verification_documents where verification_id=new.id and replaced_at is null and status='approved' and document_kind=case when new.customer_type='international_visitor' then 'passport' else 'government_id' end)
   or exists(select 1 from public.verification_documents where verification_id=new.id and replaced_at is null and status in ('rejected','resubmission_required')) then
   raise exception 'Current approved documents and all genuine review decisions required';
  end if;
 end if;
 return new;
end; $$;
create trigger verification_decision_integrity before update on public.customer_verifications
for each row execute function private.guard_verification_decisions();
create or replace function public.admin_review_verification(p_verification_id uuid,p_review_type text,p_result text,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.customer_verifications%rowtype;
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 if p_review_type not in ('identity','license','entitlement','international') or p_result not in ('under_review','approved','rejected','resubmission_required') then raise exception 'Invalid review transition'; end if;
 if p_result in ('rejected','resubmission_required') and length(trim(coalesce(p_reason,'')))=0 then raise exception 'A reason identifying the documents and required corrections is required'; end if;
 perform 1 from public.bookings b join public.customer_verifications x on x.booking_id=b.id where x.id=p_verification_id for update of b;
 select * into v from public.customer_verifications where id=p_verification_id for update;
 if v.id is null then raise exception 'Verification not found'; end if;
 if p_result='approved' and (
   (p_review_type='identity' and not exists(select 1 from public.verification_documents where verification_id=v.id and replaced_at is null and document_kind=case when v.customer_type='international_visitor' then 'passport' else 'government_id' end))
   or (p_review_type in ('license','entitlement','international') and not exists(select 1 from public.verification_documents where verification_id=v.id and replaced_at is null and document_kind='drivers_license_front'))
   or (p_review_type='international' and v.customer_type='international_visitor' and not exists(select 1 from public.verification_documents where verification_id=v.id and replaced_at is null and document_kind='passport'))
 ) then raise exception 'Required documents must be uploaded before approval'; end if;
 update public.customer_verifications set overall_status='under_review' where id=v.id and overall_status='approved' and p_result<>'approved';
 execute format('update public.customer_verifications set %I=$1, reviewer_notes=$2, reviewed_by=$3, reviewed_at=now() where id=$4',p_review_type||'_status') using p_result,p_reason,auth.uid(),p_verification_id;
 update public.verification_documents set status=p_result where verification_id=p_verification_id and replaced_at is null and
 ((p_review_type='identity' and document_kind in ('government_id','passport')) or (p_review_type='license' and document_kind in ('drivers_license_front','drivers_license_back')) or (p_review_type='international' and document_kind='international_driving_permit') or (p_review_type='entitlement' and document_kind='supporting_document'));
 select * into v from public.customer_verifications where id=p_verification_id;
 update public.customer_verifications set overall_status=case
 when 'rejected' in (v.identity_status,v.license_status,v.entitlement_status,v.international_status) then 'rejected'
 when 'resubmission_required' in (v.identity_status,v.license_status,v.entitlement_status,v.international_status) then 'resubmission_required'
 when v.identity_status='approved' and v.license_status='approved' and v.entitlement_status='approved' and v.international_status in ('approved','not_applicable') then 'approved' else 'under_review' end where id=p_verification_id;
 insert into public.verification_reviews(verification_id,review_type,result,reason,reviewer_user_id) values(p_verification_id,p_review_type,p_result,p_reason,auth.uid());
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'verification.reviewed','customer_verification',p_verification_id,jsonb_build_object('review_type',p_review_type,'result',p_result));
end; $$;
create or replace function public.register_verification_resubmission(p_booking_id uuid,p_document_kind text,p_storage_path text,p_mime_type text,p_size_bytes integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.customer_verifications%rowtype; category text; result uuid; unresolved boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform 1 from public.bookings b join public.customers c on c.id=b.customer_id where b.id=p_booking_id and c.auth_user_id=auth.uid() for update of b;
 select verification.* into v from public.customer_verifications verification join public.bookings b on b.id=verification.booking_id join public.customers c on c.id=b.customer_id where b.id=p_booking_id and c.auth_user_id=auth.uid() and b.status in ('pending','confirmed') and (b.status='confirmed' or b.expires_at is null or b.expires_at>now()) for update of verification;
 if v.id is null or v.overall_status in ('approved','rejected') then raise exception 'Resubmission is not authorized'; end if;
 category:=case when p_document_kind in ('government_id','passport') then 'identity' when p_document_kind in ('drivers_license_front','drivers_license_back') then 'license' when p_document_kind='international_driving_permit' then 'international' when p_document_kind='supporting_document' then 'entitlement' end;
 if category is null then raise exception 'Unsupported document type'; end if;
 if (case category when 'identity' then v.identity_status when 'license' then v.license_status when 'international' then v.international_status else v.entitlement_status end) in ('approved','rejected','not_applicable') then raise exception 'This component requires authorized review before replacement'; end if;
 if p_storage_path not like auth.uid()::text||'/'||p_booking_id::text||'/%' or p_size_bytes not between 1 and 8388608 or p_mime_type not in ('image/avif','image/webp','image/jpeg','image/png','application/pdf') or not exists(select 1 from storage.objects where bucket_id='identity-verification' and name=p_storage_path and metadata->>'mimetype'=p_mime_type and (metadata->>'size')::integer=p_size_bytes) then raise exception 'Private upload metadata is invalid'; end if;
 update public.verification_documents set replaced_at=now() where verification_id=v.id and document_kind=p_document_kind and replaced_at is null;
 insert into public.verification_documents(verification_id,booking_id,owner_user_id,document_kind,storage_path,mime_type,size_bytes) values(v.id,p_booking_id,auth.uid(),p_document_kind,p_storage_path,p_mime_type,p_size_bytes) returning id into result;
 select exists(select 1 from public.verification_documents where verification_id=v.id and status='resubmission_required' and replaced_at is null and
 ((category='identity' and document_kind in ('government_id','passport')) or (category='license' and document_kind in ('drivers_license_front','drivers_license_back')) or (category='international' and document_kind='international_driving_permit') or (category='entitlement' and document_kind='supporting_document'))) into unresolved;
 if not unresolved then execute format('update public.customer_verifications set %I=$1 where id=$2',category||'_status') using 'submitted',v.id; end if;
 select * into v from public.customer_verifications where id=v.id;
 update public.customer_verifications set overall_status=case when 'rejected' in (v.identity_status,v.license_status,v.entitlement_status,v.international_status) then 'rejected' when 'resubmission_required' in (v.identity_status,v.license_status,v.entitlement_status,v.international_status) then 'resubmission_required' else 'under_review' end where id=v.id;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'verification.resubmitted','customer_verification',v.id,jsonb_build_object('document_id',result,'document_kind',p_document_kind));
 return result;
end; $$;
revoke all on function public.register_verification_resubmission(uuid,text,text,text,integer) from public,anon;
grant execute on function public.register_verification_resubmission(uuid,text,text,text,integer) to authenticated;

alter policy identity_documents_owner_insert on storage.objects with check (
 bucket_id='identity-verification' and array_length(storage.foldername(name),1)=2 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.bookings b join public.customers c on c.id=b.customer_id join public.customer_verifications v on v.booking_id=b.id
 where b.id::text=(storage.foldername(name))[2] and c.auth_user_id=(select auth.uid())
 and b.status in ('pending','submitted','confirmed') and v.overall_status not in ('approved','rejected')
 and (b.status='confirmed' or b.expires_at is null or b.expires_at>now()))
);

-- Additional activation-only gate covers legacy workflow versions too. No confirmation changes.
create function private.guard_identity_handover() returns trigger
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
 select coalesce(sum(case event_type when 'cash_collected' then amount_centavos when 'cash_returned' then -amount_centavos else 0 end),0),coalesce(sum(case event_type when 'id_received' then 1 when 'id_returned' then -1 else 0 end),0)::integer into held,custody from public.security_deposit_events where booking_id=new.id;
 if d.booking_id is null or d.option not in ('cash','eligible_id') or (d.option='cash' and held<>d.required_centavos) or (d.option='eligible_id' and custody<>1)
 or coalesce((select event_type='case_opened' from public.security_deposit_events where booking_id=new.id and event_type in ('case_opened','case_resolved') order by sequence desc limit 1),false) then raise exception 'Recorded resolved deposit arrangement required'; end if;
 return new;
end; $$;
create trigger identity_handover_integrity before update of status on public.bookings
for each row execute function private.guard_identity_handover();
revoke all on function private.guard_verification_document_metadata(),private.invalidate_verification_evidence(),private.guard_verification_decisions(),private.guard_identity_handover() from public,anon,authenticated;
-- Existing delivery switches and configured event preferences remain unchanged.
create or replace function private.capture_kjm_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare bid uuid; ev text; key text; amount integer; staff boolean:=false;
begin
 if tg_table_name='booking_deposits' then
  return new;
 elsif tg_table_name='bookings' then
  if new.status is not distinct from old.status then return new; end if;
  bid:=new.id;ev:=case new.status when 'confirmed' then 'booking_approved' when 'rejected' then 'booking_rejected' when 'cancelled' then 'booking_cancelled' when 'active' then 'handover' when 'completed' then 'rental_completed' else null end;
  key:='status:'||bid||':'||new.status;
  -- Existing guarded confirmation may be automatic; identity approval is independent.
 elsif tg_table_name='verification_documents' then
  if new.replaced_at is not null then return new; end if;
  bid:=new.booking_id;ev:='verification_review';key:='document-review:'||new.id;staff:=false;
 elsif tg_table_name='customer_verifications' then
  if new.overall_status is not distinct from old.overall_status or new.overall_status not in ('approved','rejected','resubmission_required','under_review') then return new; end if;
  bid:=new.booking_id;ev:=case when new.overall_status='approved' then 'verification_approved' when new.overall_status='rejected' then 'verification_rejected' when new.overall_status='under_review' then 'verification_manual_review' else 'verification_action' end;staff:=false;key:='verification-action:'||new.id||':'||extract(epoch from new.updated_at)::text;
 elsif tg_table_name='payment_events' then
  if new.event_type<>'payment' or new.method<>'cash' then return new; end if;
  bid:=new.booking_id;ev:='cash_payment';amount:=new.amount_centavos;key:='cash-payment:'||new.id;
 elsif tg_table_name='security_deposit_events' then
  bid:=new.booking_id;amount:=new.amount_centavos;key:='deposit:'||new.id;
  ev:=case new.event_type when 'cash_collected' then 'deposit_collected' when 'cash_returned' then 'deposit_returned' when 'case_opened' then 'deposit_unresolved' when 'id_received' then 'id_custody' when 'id_returned' then 'id_custody' else null end;
  staff:=ev in ('deposit_unresolved','id_custody');
 elsif tg_table_name='rental_inspections' then
  -- Official status transitions, not preliminary inspections, send handover/completion.
  return new;
 end if;
 if ev is not null then
  perform private.enqueue_kjm_notification(bid,ev,key,amount,staff);
  if ev='rental_completed' then perform private.enqueue_kjm_notification(bid,'review_request','review:'||bid); end if;
 end if;
 return new;
exception when others then
 -- No external failure may roll back a legitimate booking/payment. Save only SQLSTATE.
 begin insert into public.notification_generation_errors(booking_id,source,sql_state,event_key,event_type,amount_centavos,staff_only) values(bid,tg_table_name,sqlstate,key,ev,amount,staff); exception when others then null; end;
 return new;
end; $$;

create or replace function private.kjm_notification_eligible(p public.notification_outbox) returns boolean language plpgsql stable security definer set search_path='' as $$
declare b public.bookings%rowtype;
begin
 if p.event_type='admin_booking_requested' then return exists(select 1 from public.bookings where id=p.booking_id and status in ('pending','submitted','confirmed')); end if;
 if p.event_type='admin_manual_review' then return exists(select 1 from public.bookings booking join public.customer_verifications verification on verification.booking_id=booking.id where booking.id=p.booking_id and booking.status in ('pending','submitted','confirmed') and verification.overall_status in ('submitted','under_review','rejected','resubmission_required')); end if;
 if p.event_type like 'admin\_%' escape '\' then
  p.event_type:=substr(p.event_type,7);
  if p.event_type='manual_review' then p.event_type:='verification_action'; end if;
 end if;
 select * into b from public.bookings where id=p.booking_id;
 if b.id is null then return false; end if;
 if p.event_type in ('pickup_reminder','pickup_summary') then return b.status='confirmed' and b.start_at>now() and (p.payload->>'pickupAt')::timestamptz=b.start_at; end if;
 if p.event_type='return_reminder' then return b.status='active' and b.end_at>now() and (p.payload->>'returnAt')::timestamptz=b.end_at; end if;
 if p.event_type='overdue' then return b.status='active' and b.end_at<now() and (p.payload->>'returnAt')::timestamptz=b.end_at; end if;
 if p.event_type='booking_requested' then return b.status in ('pending','submitted'); end if;
 if p.event_type='booking_approved' then return b.status in ('confirmed','active'); end if;
 if p.event_type in ('verification_action','verification_rejected') then return b.status in ('pending','submitted','confirmed') and exists(select 1 from public.customer_verifications where booking_id=b.id and overall_status in ('rejected','resubmission_required')); end if;
 if p.event_type='verification_manual_review' then return b.status in ('pending','submitted','confirmed') and exists(select 1 from public.customer_verifications where booking_id=b.id and overall_status='under_review'); end if;
 if p.event_type='verification_review' then return b.status in ('pending','submitted','confirmed'); end if;
 if p.event_type='verification_approved' then return exists(select 1 from public.customer_verifications where booking_id=b.id and overall_status='approved' and identity_status='approved' and license_status='approved' and entitlement_status='approved' and international_status in ('approved','not_applicable') and reviewed_by is not null and license_expiration_date>=(now() at time zone 'Asia/Manila')::date and (customer_type<>'international_visitor' or international_status='approved') and exists(select 1 from public.verification_documents d where d.booking_id=b.id and d.document_kind='drivers_license_front' and d.replaced_at is null and d.status='approved') and exists(select 1 from public.verification_documents d where d.booking_id=b.id and d.document_kind=case when customer_type='international_visitor' then 'passport' else 'government_id' end and d.replaced_at is null and d.status='approved')); end if;
 if p.event_type='booking_modified' then return b.status='confirmed'; end if;
 if p.event_type in ('rental_completed','review_request') then return b.status='completed'; end if;
 -- Receipts and physical history remain valid after cancellation/expiry.
 return true;
end; $$;

create or replace function public.admin_save_notification_settings(p_settings jsonb) returns void language plpgsql security definer set search_path='' as $$
declare events text[];
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 select coalesce(array_agg(x),'{}') into events from jsonb_array_elements_text(p_settings->'enabled_events') x;
 if not events <@ array['booking_requested','booking_approved','booking_rejected','verification_review','verification_manual_review','verification_action','booking_cancelled','pickup_reminder','pickup_summary','handover','return_reminder','overdue','returned','cash_payment','deposit_collected','deposit_returned','deposit_unresolved','id_custody','rental_completed','booking_modified','review_request','verification_approved','verification_rejected','admin_booking_requested','admin_booking_cancelled','admin_booking_modified','admin_pickup_reminder','admin_return_reminder','admin_overdue','admin_verification_review','admin_manual_review'] then raise exception 'Unsupported event category'; end if;
 update public.notification_settings set enabled_events=events,reminders_approved=coalesce((p_settings->>'reminders_approved')::boolean,false),
 pickup_hours=(p_settings->>'pickup_hours')::integer,return_hours=(p_settings->>'return_hours')::integer,morning_hour=(p_settings->>'morning_hour')::integer,updated_at=now(),updated_by=auth.uid() where id;
 -- External activation is deliberately unavailable in the browser UI.
 insert into public.audit_logs(actor_user_id,action,entity_type,metadata) values(auth.uid(),'notifications.preferences_saved','notification_settings',jsonb_build_object('event_count',cardinality(events)));
end; $$;

-- Append-only advisory history in the existing protected audit log. Never an approval signal.
create function public.record_verification_prescreen(p_booking_id uuid,p_owner_id uuid,p_document_ids uuid[],p_summary jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare verification uuid; actual uuid[]; supplied uuid[];
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server authorization required'; end if;
 perform 1 from public.bookings b join public.customers c on c.id=b.customer_id where b.id=p_booking_id and c.auth_user_id=p_owner_id for update of b;
 if not found then return false; end if;
 select id into verification from public.customer_verifications where booking_id=p_booking_id for update;
 if verification is null or p_summary is null or jsonb_typeof(p_summary)<>'object' or octet_length(p_summary::text)>16000
 or coalesce(p_summary->>'preliminaryStatus','') not in ('passed','correction_required','manual_review_required')
 or jsonb_typeof(p_summary->'checks') is distinct from 'array' or jsonb_typeof(p_summary->'corrections') is distinct from 'array'
 then return false; end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into actual from public.verification_documents where verification_id=verification and replaced_at is null;
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into supplied from unnest(p_document_ids) id;
 if actual is distinct from supplied then return false; end if;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
 values(p_owner_id,'verification.prechecked','customer_verification',verification,jsonb_build_object('document_ids',actual,'summary',p_summary));
 return true;
end; $$;
revoke all on function public.record_verification_prescreen(uuid,uuid,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.record_verification_prescreen(uuid,uuid,uuid[],jsonb) to service_role;
create function public.get_verification_progress(p_booking_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v public.customer_verifications%rowtype; b public.bookings%rowtype; ids jsonb; checks jsonb; reviews jsonb; kinds jsonb;
begin
 select booking.* into b from public.bookings booking join public.customers c on c.id=booking.customer_id
 where booking.id=p_booking_id and (c.auth_user_id=auth.uid() or private.is_active_admin());
 if b.id is null then raise exception 'Booking unavailable'; end if;
 select * into v from public.customer_verifications where booking_id=b.id;
 select coalesce(jsonb_agg(id::text order by id),'[]') into ids from public.verification_documents where verification_id=v.id and replaced_at is null;
 select coalesce(jsonb_agg(item order by created_at desc),'[]') into checks from (
  select a.created_at,jsonb_build_object('id',a.id,'createdAt',a.created_at,'current',coalesce((select jsonb_agg(value order by value) from jsonb_array_elements_text(a.metadata->'document_ids')),'[]')=ids,'summary',a.metadata->'summary') item
  from public.audit_logs a where a.entity_id=v.id and a.entity_type='customer_verification' and a.action='verification.prechecked' order by a.created_at desc limit 8
 ) h;
 select coalesce(jsonb_agg(item order by created_at desc),'[]') into reviews from (
  select created_at,jsonb_build_object('id',id,'type',review_type,'result',result,'reason',reason,'createdAt',created_at) item from public.verification_reviews
  where verification_id=v.id and review_type<>'document_access' order by created_at desc limit 20
 ) h;
 select coalesce(jsonb_agg(kind),'[]') into kinds from (values
 ('drivers_license_front',v.license_status),('drivers_license_back',v.license_status),
 (case when v.customer_type='international_visitor' then 'passport' else 'government_id' end,v.identity_status),
 ('international_driving_permit',case when v.customer_type='international_visitor' then v.international_status else 'not_applicable' end),
 ('supporting_document',case when v.entitlement_status='resubmission_required' then v.entitlement_status else 'not_applicable' end)
 ) t(kind,state) where state not in ('approved','rejected','not_applicable') and v.overall_status not in ('approved','rejected')
 and b.status in ('pending','confirmed') and (b.status='confirmed' or b.expires_at is null or b.expires_at>now());
 return jsonb_build_object('overallStatus',v.overall_status,'uploadKinds',kinds,'checks',checks,'reviews',reviews);
end; $$;
revoke all on function public.get_verification_progress(uuid) from public,anon;
grant execute on function public.get_verification_progress(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
