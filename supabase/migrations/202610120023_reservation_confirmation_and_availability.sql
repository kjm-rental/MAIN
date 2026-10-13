-- PREPARED FOR REVIEW. Tested only against the explicitly guarded disposable project.
-- No settings/price changes, no public-booking activation, no historical backfill.
create table public.rental_terms_versions (
 version text primary key, source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 effective_date date not null, archive_path text not null, is_current boolean not null default false
);
create unique index rental_terms_one_current on public.rental_terms_versions(is_current) where is_current;
insert into public.rental_terms_versions values('2026-10-12','c3b67ee46b4d490fee7d638b94d5ff9ce560150c513f0ec239901cdd942e8c74','2026-10-12','/terms/2026-10-12',true);
create table public.booking_terms_acceptances (
 booking_id uuid primary key references public.bookings(id) on delete restrict,
 auth_user_id uuid not null references auth.users(id) on delete restrict,
 terms_version text not null references public.rental_terms_versions(version) on delete restrict,
 source_sha256 text not null, accepted_at timestamptz not null default clock_timestamp()
);
create table public.booking_confirmation_records (
 booking_id uuid primary key references public.bookings(id) on delete restrict,
 motorcycle_unit_id uuid not null references public.motorcycle_units(id) on delete restrict,
 auth_user_id uuid not null references auth.users(id) on delete restrict,
 confirmed_at timestamptz not null default clock_timestamp()
);
alter table public.rental_terms_versions enable row level security;
alter table public.rental_terms_versions force row level security;
alter table public.booking_terms_acceptances enable row level security;
alter table public.booking_terms_acceptances force row level security;
alter table public.booking_confirmation_records enable row level security;
alter table public.booking_confirmation_records force row level security;
revoke all on public.rental_terms_versions,public.booking_terms_acceptances,public.booking_confirmation_records from public,anon,authenticated;
grant select on public.rental_terms_versions to anon,authenticated;
grant select on public.booking_terms_acceptances,public.booking_confirmation_records to authenticated;
create policy rental_terms_public_read on public.rental_terms_versions for select to anon,authenticated using(true);
create policy terms_acceptance_owner_admin_read on public.booking_terms_acceptances for select to authenticated using(auth_user_id=(select auth.uid()) or (select private.is_active_admin()));
create policy confirmations_owner_admin_read on public.booking_confirmation_records for select to authenticated using(auth_user_id=(select auth.uid()) or (select private.is_active_admin()));
create trigger terms_acceptance_immutable before update or delete on public.booking_terms_acceptances for each row execute function private.guard_rental_immutable();
create trigger booking_confirmation_immutable before update or delete on public.booking_confirmation_records for each row execute function private.guard_rental_immutable();

-- Canonical unit count uses the existing half-open inventory semantics.
create function private.available_motorcycle_units(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz)
returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.motorcycle_units u
 where u.motorcycle_model_id=p_model_id and u.status='available' and u.archived_at is null
 and not exists(select 1 from public.bookings b where b.motorcycle_unit_id=u.id and b.status in ('pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)'))
 and not exists(select 1 from public.booking_inventory_holds h where h.motorcycle_unit_id=u.id and h.released_at is null and h.converted_at is null and h.expires_at>now() and tstzrange(h.start_at,h.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)'))
 and not exists(select 1 from public.motorcycle_unavailability x where x.motorcycle_unit_id=u.id and tstzrange(x.start_at,x.end_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)'));
$$;
revoke all on function private.available_motorcycle_units(uuid,timestamptz,timestamptz) from public,anon,authenticated;
create or replace function public.check_model_availability(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz)
returns integer language plpgsql stable security definer set search_path='' as $$
begin perform public.get_booking_quote(p_model_id,p_start_at,p_end_at); return private.available_motorcycle_units(p_model_id,p_start_at,p_end_at); end; $$;

-- Read-only aggregate preview is available while the booking master switch is OFF.
-- It exposes no unit identifiers, customer data or reservation details.
create function public.get_model_slot_availability(p_model_id uuid,p_periods jsonb)
returns table(slot_key text,available_count integer) language plpgsql stable security definer set search_path='' as $$
declare item jsonb; starts timestamptz; ends timestamptz;
begin
 if p_periods is null or jsonb_typeof(p_periods)<>'array' or jsonb_array_length(p_periods)>2200 then raise exception 'Invalid availability batch'; end if;
 for item in select value from jsonb_array_elements(p_periods) loop
  slot_key:=left(coalesce(item->>'key',''),80); available_count:=0;
  begin
   starts:=(item->>'start_at')::timestamptz;ends:=(item->>'end_at')::timestamptz;
   if starts is not null and ends>starts and starts>now() then
    -- Same operating-hour and duration rules, without granting permission to book.
    perform private.calculate_booking_quote(p_model_id,starts,ends,false);
    available_count:=private.available_motorcycle_units(p_model_id,starts,ends);
   end if;
  exception when invalid_datetime_format or datetime_field_overflow or raise_exception then available_count:=0;
  end;
  return next;
 end loop;
end; $$;
revoke all on function public.get_model_slot_availability(uuid,jsonb) from public;
grant execute on function public.get_model_slot_availability(uuid,jsonb) to anon,authenticated;

create function public.finalize_booking_request(p_booking_id uuid,p_terms_version text,p_terms_accepted boolean)
returns table(booking_status text,verification_status text) language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; v public.customer_verifications%rowtype; h public.booking_inventory_holds%rowtype; t public.rental_terms_versions%rowtype; accepted public.booking_terms_acceptances%rowtype; c public.customers%rowtype; settings public.booking_settings%rowtype;
begin
 if auth.uid() is null or p_terms_accepted is distinct from true then raise exception 'Authentication and terms acceptance required'; end if;
 select booking.* into b from public.bookings booking join public.customers customer on customer.id=booking.customer_id where booking.id=p_booking_id and customer.auth_user_id=auth.uid() for update of booking;
 if b.id is null then raise exception 'Booking not found'; end if;
 select * into v from public.customer_verifications where booking_id=b.id for update;
 select * into accepted from public.booking_terms_acceptances where booking_id=b.id;
 if found then
  if accepted.terms_version is distinct from p_terms_version then raise exception 'Accepted terms version is immutable'; end if;
  return query select b.status,v.overall_status;return;
 end if;
 select * into settings from public.booking_settings where id=true;
 if not ((settings.public_booking_enabled and settings.policies_approved_at is not null) or private.is_active_booking_tester(auth.uid())) then raise exception 'Online booking is not enabled for this session'; end if;
 if b.status not in ('pending','submitted') or b.expires_at is null or b.expires_at<=now() then raise exception 'Request expired or is not pending'; end if;
 select * into t from public.rental_terms_versions where version=p_terms_version and is_current;
 if t.version is null then raise exception 'Review the current Terms and Conditions before submitting'; end if;
 select * into c from public.customers where id=b.customer_id;
 if length(trim(coalesce(c.full_name,''))) not between 2 and 160 or coalesce(c.phone,'') !~ '^\+?[0-9][0-9[:space:]()-]{6,24}$' or length(trim(coalesce(c.country_of_residence,''))) not between 2 and 100 or length(trim(coalesce(v.license_issuing_country,'')))=0 or coalesce(c.email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or v.license_expiration_date is null or v.license_expiration_date<(now() at time zone 'Asia/Manila')::date or length(trim(coalesce(v.identity_name,'')))=0 or length(trim(coalesce(v.license_name,'')))=0 or length(trim(coalesce(v.permitted_vehicle_categories,'')))=0 or v.privacy_consent_at is null or v.customer_declaration_at is null then raise exception 'Required booking information is invalid'; end if;
 if v.overall_status in ('rejected','resubmission_required') then raise exception 'Documents require correction before reservation confirmation'; end if;
 -- Registered metadata must refer to an actual matching private object.
 if not exists(select 1 from public.verification_documents d join storage.objects o on o.name=d.storage_path and o.bucket_id='identity-verification' where d.booking_id=b.id and d.verification_id=v.id and d.owner_user_id=auth.uid() and d.document_kind='drivers_license_front' and d.replaced_at is null and d.status not in ('rejected','resubmission_required') and d.mime_type=o.metadata->>'mimetype' and d.size_bytes=(o.metadata->>'size')::integer)
 or not exists(select 1 from public.verification_documents d join storage.objects o on o.name=d.storage_path and o.bucket_id='identity-verification' where d.booking_id=b.id and d.verification_id=v.id and d.owner_user_id=auth.uid() and d.document_kind=case when v.customer_type='international_visitor' then 'passport' else 'government_id' end and d.replaced_at is null and d.status not in ('rejected','resubmission_required') and d.mime_type=o.metadata->>'mimetype' and d.size_bytes=(o.metadata->>'size')::integer) then raise exception 'Required private documents are missing'; end if;
 select * into h from public.booking_inventory_holds where booking_id=b.id and released_at is null and converted_at is null and expires_at>now() for update;
 if h.id is null or h.start_at<>b.start_at or h.end_at<>b.end_at then raise exception 'Inventory hold expired; choose another available period'; end if;
 perform pg_advisory_xact_lock(hashtextextended(b.motorcycle_model_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended(h.motorcycle_unit_id::text,0));
 -- Existing unit must still be eligible; the normal confirmation guard also checks overlaps/maintenance.
 if not exists(select 1 from public.motorcycle_units where id=h.motorcycle_unit_id and motorcycle_model_id=b.motorcycle_model_id and status='available' and archived_at is null) then raise exception 'Reserved motorcycle is no longer available'; end if;
 insert into public.booking_terms_acceptances(booking_id,auth_user_id,terms_version,source_sha256) values(b.id,auth.uid(),t.version,t.source_sha256);
 -- International booking approval remains manual; no document status is auto-approved.
 if v.customer_type='philippine_resident' then
  insert into public.booking_confirmation_records(booking_id,motorcycle_unit_id,auth_user_id) values(b.id,h.motorcycle_unit_id,auth.uid());
  update public.bookings set status='confirmed',motorcycle_unit_id=h.motorcycle_unit_id,expires_at=null where id=b.id;
  update public.booking_inventory_holds set converted_at=now() where id=h.id;
  insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(b.id,b.status,'confirmed',auth.uid());
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'booking.auto_confirmed','booking',b.id,jsonb_build_object('unit_id',h.motorcycle_unit_id,'terms_version',t.version,'verification_pending',true));
  booking_status:='confirmed';
 else booking_status:=b.status;
 end if;
 verification_status:=v.overall_status;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'booking.terms_accepted','booking',b.id,jsonb_build_object('version',t.version,'source_sha256',t.source_sha256));
 return next;
end; $$;
revoke all on function public.finalize_booking_request(uuid,text,boolean) from public,anon;
grant execute on function public.finalize_booking_request(uuid,text,boolean) to authenticated;
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
   select coalesce(sum(case event_type when 'cash_collected' then amount_centavos when 'cash_returned' then -amount_centavos else 0 end),0),coalesce(sum(case event_type when 'id_received' then 1 when 'id_returned' then -1 else 0 end),0)::integer into held,custody from public.security_deposit_events where booking_id=new.id;
   select coalesce((select event_type='case_opened' from public.security_deposit_events where booking_id=new.id and event_type in ('case_opened','case_resolved') order by sequence desc limit 1),false) into unresolved;
   if new.status='active' and (unresolved or (d.option='cash' and held<>d.required_centavos) or (d.option='eligible_id' and custody<>1)) then raise exception 'The quoted security deposit arrangement must be received and resolved before handover'; end if;
   if new.status='completed' and (not exists(select 1 from public.rental_inspections where booking_id=new.id and kind='return') or ((held>0 or custody>0) and not unresolved)) then raise exception 'Return inspection and deposit return or an explicit unresolved case are required'; end if;
 end if;
 return new;
end; $$;

-- Allow corrected private objects only for an owned pre-pickup reservation
-- whose staff review explicitly requests resubmission. Metadata registration
-- stays restricted to the guarded RPC below; existing insert RLS is unchanged.
drop policy identity_documents_owner_insert on storage.objects;
create policy identity_documents_owner_insert on storage.objects for insert to authenticated with check (
 bucket_id='identity-verification' and array_length(storage.foldername(name),1)=2 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.bookings b join public.customers c on c.id=b.customer_id join public.customer_verifications v on v.booking_id=b.id
 where b.id::text=(storage.foldername(name))[2] and c.auth_user_id=(select auth.uid())
 and ((b.status in ('submitted','pending') and (b.expires_at is null or b.expires_at>now())) or (b.status='confirmed' and v.overall_status='resubmission_required')))
);

create or replace function public.admin_review_verification(p_verification_id uuid,p_review_type text,p_result text,p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.customer_verifications%rowtype;
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 if p_review_type not in ('identity','license','entitlement','international') or p_result not in ('under_review','approved','rejected','resubmission_required') then raise exception 'Invalid review transition'; end if;
 if p_result in ('rejected','resubmission_required') and length(trim(coalesce(p_reason,'')))=0 then raise exception 'A reason identifying the documents and required corrections is required'; end if;
 select * into v from public.customer_verifications where id=p_verification_id for update;
 if v.id is null then raise exception 'Verification not found'; end if;
 if p_result='approved' and (
   (p_review_type='identity' and not exists(select 1 from public.verification_documents where verification_id=v.id and replaced_at is null and document_kind=case when v.customer_type='international_visitor' then 'passport' else 'government_id' end))
   or (p_review_type in ('license','entitlement','international') and not exists(select 1 from public.verification_documents where verification_id=v.id and replaced_at is null and document_kind='drivers_license_front'))
   or (p_review_type='international' and v.customer_type='international_visitor' and not exists(select 1 from public.verification_documents where verification_id=v.id and replaced_at is null and document_kind='passport'))
 ) then raise exception 'Required documents must be uploaded before approval'; end if;
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

create function public.register_verification_resubmission(p_booking_id uuid,p_document_kind text,p_storage_path text,p_mime_type text,p_size_bytes integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v public.customer_verifications%rowtype; category text; result uuid; unresolved boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select verification.* into v from public.customer_verifications verification join public.bookings b on b.id=verification.booking_id join public.customers c on c.id=b.customer_id where b.id=p_booking_id and c.auth_user_id=auth.uid() and b.status in ('pending','confirmed') for update of verification;
 if v.id is null or v.overall_status<>'resubmission_required' then raise exception 'Resubmission is not authorized'; end if;
 category:=case when p_document_kind in ('government_id','passport') then 'identity' when p_document_kind in ('drivers_license_front','drivers_license_back') then 'license' when p_document_kind='international_driving_permit' then 'international' when p_document_kind='supporting_document' then 'entitlement' end;
 if category is null or not exists(select 1 from public.verification_documents where verification_id=v.id and document_kind=p_document_kind and status='resubmission_required' and replaced_at is null) then raise exception 'This document was not requested for replacement'; end if;
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

-- Let a customer safely abandon only their own unfinished request when dates
-- must change; confirmed reservations still use controlled staff cancellation.
create function public.abandon_booking_request(p_booking_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select booking.* into b from public.bookings booking join public.customers c on c.id=booking.customer_id where booking.id=p_booking_id and c.auth_user_id=auth.uid() for update of booking;
 if b.id is null or b.status not in ('pending','submitted') then raise exception 'Only your unfinished pending request can be abandoned'; end if;
 update public.bookings set status='cancelled',status_reason='Customer changed an unfinished rental request' where id=b.id;
 update public.booking_inventory_holds set released_at=now() where booking_id=b.id and released_at is null and converted_at is null;
 insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(b.id,b.status,'cancelled',auth.uid());
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'booking.draft_abandoned','booking',b.id);
end; $$;
revoke all on function public.abandon_booking_request(uuid) from public,anon;
grant execute on function public.abandon_booking_request(uuid) to authenticated;

-- Existing outbox/provider switches remain unchanged.
create or replace function private.enqueue_kjm_notification(p_booking uuid,p_event text,p_key text,p_amount integer default null,p_staff_only boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; d public.booking_deposits%rowtype; customer_auth uuid; content jsonb; ch text;
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
end; $$;

-- Only correction instructions are shared with the owning customer; private
-- approval/rejection notes and other customers' review history stay protected.
create function public.get_verification_resubmission_instructions(p_booking_id uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare v public.customer_verifications%rowtype; instructions text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select verification.* into v from public.customer_verifications verification join public.customers c on c.id=verification.customer_id where verification.booking_id=p_booking_id and (c.auth_user_id=auth.uid() or private.is_active_admin());
 if v.id is null then raise exception 'Verification not found'; end if;
 select string_agg(latest.review_type||': '||latest.reason,E'\n' order by latest.created_at) into instructions from (
  select distinct on (r.review_type) r.review_type,r.reason,r.created_at from public.verification_reviews r where r.verification_id=v.id and r.result='resubmission_required' and
  ((r.review_type='identity' and v.identity_status='resubmission_required') or (r.review_type='license' and v.license_status='resubmission_required') or (r.review_type='entitlement' and v.entitlement_status='resubmission_required') or (r.review_type='international' and v.international_status='resubmission_required')) order by r.review_type,r.created_at desc
 ) latest;
 return instructions;
end; $$;
revoke all on function public.get_verification_resubmission_instructions(uuid) from public,anon;
grant execute on function public.get_verification_resubmission_instructions(uuid) to authenticated;
