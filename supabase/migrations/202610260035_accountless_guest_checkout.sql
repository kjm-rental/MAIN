-- REVIEW REQUIRED. Not executed. Requires migrations 020–034.
-- No customer Auth users, passwords, OTPs or verified-email requirements.
-- Existing records, RLS, inventory guards, handover rules and transport settings remain intact.
begin;
alter table public.verification_documents alter column owner_user_id drop not null;
alter table public.booking_terms_acceptances alter column auth_user_id drop not null;
alter table public.booking_confirmation_records alter column auth_user_id drop not null;
create table public.guest_booking_contacts(
 booking_id uuid primary key references public.bookings(id) on delete restrict,
 access_hash text not null check(access_hash ~ '^[a-f0-9]{64}$'),
 email text not null check(email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 request_fingerprint text not null, created_at timestamptz not null default now()
);
alter table public.guest_booking_contacts enable row level security;
alter table public.guest_booking_contacts force row level security;
revoke all on public.guest_booking_contacts from public,anon,authenticated;
grant select on public.guest_booking_contacts to service_role;
create trigger guest_booking_contact_immutable before update or delete on public.guest_booking_contacts for each row execute function private.guard_rental_immutable();

-- Service-only orchestration reuses the exact existing quote, extras, hold and guard infrastructure.
create function public.submit_guest_booking_request(p_payload jsonb,p_access_hash text)
returns table(booking_id uuid,booking_reference text,verification_id uuid,rental_total_centavos integer,deposit_required_centavos integer,cash_due_at_pickup_centavos bigint)
language plpgsql security definer set search_path='' as $$
declare model uuid:=(p_payload->>'p_model_id')::uuid; starts timestamptz:=(p_payload->>'p_start_at')::timestamptz; ends timestamptz:=(p_payload->>'p_end_at')::timestamptz;
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
 select u.id into unit_id from public.motorcycle_units u where u.motorcycle_model_id=model and u.status='available' and u.archived_at is null
 and not exists(select 1 from public.bookings b where b.motorcycle_unit_id=u.id and b.status in ('pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(starts,ends,'[)'))
 and not exists(select 1 from public.booking_inventory_holds h where h.motorcycle_unit_id=u.id and h.released_at is null and h.converted_at is null and h.expires_at>now() and tstzrange(h.start_at,h.end_at,'[)')&&tstzrange(starts,ends,'[)'))
 and not exists(select 1 from public.motorcycle_unavailability x where x.motorcycle_unit_id=u.id and tstzrange(x.start_at,x.end_at,'[)')&&tstzrange(starts,ends,'[)')) order by u.internal_unit_code for update of u skip locked limit 1;
 if unit_id is null then raise exception 'No available motorcycle'; end if;
 perform 1 from private.calculate_extra_selection(p_payload->'p_extra_items',starts,ends,q.pricing_units,true);
 -- A separate contact per booking: another request cannot change this recipient.
 insert into public.customers(auth_user_id,full_name,email,phone,country_of_residence,customer_type) values(null,btrim(p_payload->>'p_full_name'),email,btrim(p_payload->>'p_phone'),btrim(p_payload->>'p_country'),customer_type) returning id into customer_id;
 ref:='KJM-'||to_char(now() at time zone 'Asia/Manila','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.bookings(booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,base_total_php,extras_total_php,pricing_daily_rate_php,pricing_units,submitted_at,expires_at,idempotency_key)
 values(ref,customer_id,model,starts,ends,'pending',q.total_centavos/100,q.base_total_centavos/100,q.extras_total_centavos/100,q.daily_rate_php,q.pricing_units,now(),now()+make_interval(mins=>bs.pending_expiration_minutes),idem) returning id into bid;
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
revoke all on function public.submit_guest_booking_request(jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_guest_booking_request(jsonb,text) to service_role;

create function public.register_guest_verification_document(p_booking_id uuid,p_access_hash text,p_kind text,p_storage_path text,p_mime_type text,p_size_bytes integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; v public.customer_verifications%rowtype; category text; result uuid; existing uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server authorization required'; end if;
 perform 1 from public.guest_booking_contacts where booking_id=p_booking_id and access_hash=p_access_hash;
 if not found then raise exception 'Guest booking unavailable'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 select * into v from public.customer_verifications where booking_id=b.id for update;
 if b.status not in ('pending','confirmed') or (b.status='pending' and b.expires_at<=now()) or v.overall_status in ('approved','rejected') then raise exception 'Document changes unavailable'; end if;
 category:=case when p_kind in ('passport','government_id') then 'identity' when p_kind in ('drivers_license_front','drivers_license_back') then 'license' when p_kind='international_driving_permit' then 'international' when p_kind='supporting_document' then 'entitlement' end;
 if (select count(*) from public.verification_documents where booking_id=b.id and created_at>now()-interval '1 hour')>=12 then raise exception 'Too many upload attempts'; end if;
 if category is null or p_storage_path not like 'guest/'||b.id::text||'/%' or p_size_bytes not between 1 and 8388608 or p_mime_type not in ('image/avif','image/webp','image/jpeg','image/png','application/pdf') or not exists(select 1 from storage.objects where bucket_id='identity-verification' and name=p_storage_path and metadata->>'mimetype'=p_mime_type and (metadata->>'size')::integer=p_size_bytes) then raise exception 'Invalid private document'; end if;
 if (case category when 'identity' then v.identity_status when 'license' then v.license_status when 'international' then v.international_status else v.entitlement_status end) in ('approved','rejected','not_applicable') then raise exception 'This document category cannot be replaced'; end if;
 select id into existing from public.verification_documents where booking_id=b.id and document_kind=p_kind and replaced_at is null;
 if existing is not null and exists(select 1 from public.booking_terms_acceptances where booking_id=b.id) and (case category when 'identity' then v.identity_status when 'license' then v.license_status when 'international' then v.international_status else v.entitlement_status end)<>'resubmission_required' then raise exception 'A correction request is required'; end if;
 update public.verification_documents set replaced_at=now() where booking_id=b.id and document_kind=p_kind and replaced_at is null;
 insert into public.verification_documents(verification_id,booking_id,owner_user_id,document_kind,storage_path,mime_type,size_bytes) values(v.id,b.id,null,p_kind,p_storage_path,p_mime_type,p_size_bytes) returning id into result;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(null,'verification.guest_uploaded','customer_verification',v.id,jsonb_build_object('document_id',result,'document_kind',p_kind));
 return result;
end; $$;
revoke all on function public.register_guest_verification_document(uuid,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.register_guest_verification_document(uuid,text,text,text,text,integer) to service_role;

create function public.finalize_guest_booking_request(p_booking_id uuid,p_access_hash text,p_terms_version text,p_terms_accepted boolean)
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
 -- International booking approval remains manual; no document status is auto-approved.
 if v.customer_type='philippine_resident' then
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
revoke all on function public.finalize_guest_booking_request(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.finalize_guest_booking_request(uuid,text,text,boolean) to service_role;

create function public.abandon_guest_booking_request(p_booking_id uuid,p_access_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server authorization required'; end if;
 perform 1 from public.bookings b join public.guest_booking_contacts g on g.booking_id=b.id where b.id=p_booking_id and g.access_hash=p_access_hash and b.status='pending' and not exists(select 1 from public.booking_terms_acceptances where booking_id=b.id) for update of b;
 if not found then raise exception 'Only unfinished pending requests may be reset'; end if;
 update public.bookings set status='cancelled',status_reason='Guest reset unfinished checkout' where id=p_booking_id;
 update public.booking_inventory_holds set released_at=now() where booking_id=p_booking_id and released_at is null and converted_at is null;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(null,'booking.guest_reset','booking',p_booking_id,'{}');
end; $$;
revoke all on function public.abandon_guest_booking_request(uuid,text) from public,anon,authenticated;
grant execute on function public.abandon_guest_booking_request(uuid,text) to service_role;

create or replace function public.record_verification_prescreen(p_booking_id uuid,p_owner_id uuid,p_document_ids uuid[],p_summary jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare verification uuid; actual uuid[]; supplied uuid[]; risk text; level integer; check_id uuid; ev text; current_status text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server authorization required'; end if;
 perform 1 from public.bookings b join public.customers c on c.id=b.customer_id where b.id=p_booking_id and (c.auth_user_id=p_owner_id or (p_owner_id is null and c.auth_user_id is null and exists(select 1 from public.guest_booking_contacts g where g.booking_id=b.id))) for update of b;
 if not found then return false; end if;
 select id into verification from public.customer_verifications where booking_id=p_booking_id for update;
 if verification is null or p_summary is null or jsonb_typeof(p_summary)<>'object' or octet_length(p_summary::text)>16000
 or coalesce(p_summary->>'preliminaryStatus','') not in ('passed','correction_required','manual_review_required')
 or jsonb_typeof(p_summary->'checks') is distinct from 'array' or jsonb_typeof(p_summary->'corrections') is distinct from 'array'
 then return false; end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into actual from public.verification_documents where verification_id=verification and replaced_at is null;
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into supplied from unnest(p_document_ids) id;
 if actual is distinct from supplied then return false; end if;
 risk:=p_summary->>'riskStatus';
 level:=case risk when 'DOCUMENT_CHECKS_PASSED' then 1 when 'MANUAL_REVIEW_REQUIRED' then 2 when 'CORRECTION_REQUIRED' then 3 else null end;
 if level is null or coalesce(p_summary->>'riskLevel','')<>level::text
 or jsonb_typeof(p_summary->'reviewReasons') is distinct from 'array'
 or (level=1 and p_summary->>'preliminaryStatus' is distinct from 'passed')
 or (level=3 and jsonb_array_length(p_summary->'corrections')=0) then return false; end if;
 -- A date already stored by the review workflow can revoke expired license eligibility;
 -- an OCR discrepancy alone never grants or fabricates a verified decision.
 update public.customer_verifications set overall_status='under_review',license_status='resubmission_required'
 where id=verification and overall_status='approved' and license_expiration_date<(now() at time zone 'Asia/Manila')::date;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
 values(p_owner_id,'verification.prechecked','customer_verification',verification,jsonb_build_object('document_ids',actual,'summary',p_summary)) returning id into check_id;
 update public.customer_verifications set document_check_status=risk,document_risk_level=level,document_review_reasons=p_summary->'reviewReasons',document_check_id=check_id where id=verification returning overall_status into current_status;
 -- Correction requests live in the separate risk status/history. Never relabel
 -- submitted documents or change booking eligibility from an OCR result.
 ev:=case level when 1 then 'document_checks_passed' when 2 then 'verification_manual_review' else 'verification_action' end;
 perform private.enqueue_kjm_notification(p_booking_id,ev,'document-risk:'||check_id);
 update public.notification_outbox set payload=payload||jsonb_build_object('documentCheckId',check_id,'documentRiskStatus',risk) where event_key='document-risk:'||check_id;
 return true;
end; $$;

create or replace function private.enqueue_kjm_notification(p_booking uuid,p_event text,p_key text,p_amount integer default null,p_staff_only boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; d public.booking_deposits%rowtype; customer_auth uuid; content jsonb; ch text; admin_event text; guest_email text;
begin
 select * into b from public.bookings where id=p_booking;
 if b.id is null then return; end if;
 select * into d from public.booking_deposits where booking_id=b.id;
 select auth_user_id into customer_auth from public.customers where id=b.customer_id;
 content:=jsonb_build_object('bookingId',b.id,'reference',b.booking_reference,'motorcycle',coalesce((select display_name from public.motorcycle_models where id=b.motorcycle_model_id),'Motorcycle'),
 'pickupAt',b.start_at,'returnAt',b.end_at,'rentalCentavos',b.total_centavos,'depositOption',coalesce(d.option,'unconfirmed'),
 'depositCentavos',d.required_centavos,'amountCentavos',p_amount,'status',b.status,'verificationStatus',(select overall_status from public.customer_verifications where booking_id=b.id));
 select email into guest_email from public.guest_booking_contacts where booking_id=b.id;
 if guest_email is not null then content:=content||jsonb_build_object('guestCheckout',true); end if;
 foreach ch in array array['telegram','resend'] loop
  if ch='resend' and (p_staff_only or (customer_auth is null and guest_email is null)) then continue; end if;
  insert into public.notification_outbox(event_key,booking_id,booking_reference,event_type,channel,recipient_reference,payload,is_test)
  values(p_key,b.id,b.booking_reference,p_event,ch,case when ch='telegram' then 'operations' else coalesce(case when guest_email is not null then 'guest:'||b.id::text end,customer_auth::text) end,content,b.is_test)
  on conflict(event_key,channel,recipient_reference) do nothing;
 end loop;
 admin_event:=case p_event when 'booking_requested' then 'admin_booking_requested' when 'booking_cancelled' then 'admin_booking_cancelled' when 'booking_modified' then 'admin_booking_modified' when 'pickup_reminder' then 'admin_pickup_reminder' when 'return_reminder' then 'admin_return_reminder' when 'overdue' then 'admin_overdue' when 'verification_review' then 'admin_verification_review' when 'verification_action' then 'admin_manual_review' when 'verification_rejected' then 'admin_manual_review' when 'verification_manual_review' then 'admin_manual_review' else null end;
 if admin_event is not null then
  insert into public.notification_outbox(event_key,booking_id,booking_reference,event_type,channel,recipient_reference,payload,is_test)
  values(p_key,b.id,b.booking_reference,admin_event,'resend','operations',content,b.is_test)
  on conflict(event_key,channel,recipient_reference) do nothing;
 end if;
end; $$;

create or replace function private.kjm_resend_recipient_bound(p public.notification_outbox)
returns boolean language sql stable security definer set search_path='' as $$
 select p.channel <> 'resend'
   or (p.recipient_reference='operations' and p.event_type like 'admin\_%' escape '\')
   or exists(select 1 from public.guest_booking_contacts g where g.booking_id=p.booking_id and p.recipient_reference='guest:'||g.booking_id::text)
   or exists (
     select 1 from public.bookings b
     join public.customers c on c.id=b.customer_id
     join auth.users u on u.id=c.auth_user_id
     where b.id=p.booking_id and u.id::text=p.recipient_reference
       and u.email_confirmed_at is not null and u.email is not null
       and lower(btrim(u.email))=lower(btrim(c.email))
   );
$$;
revoke all on function private.kjm_resend_recipient_bound(public.notification_outbox) from public,anon,authenticated,service_role;

create or replace function public.notification_delivery_context(p_id uuid,p_lease uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n public.notification_outbox%rowtype; recipient text;
begin
 select * into n from public.notification_outbox where id=p_id;
 if n.id is null or p_lease is null or n.status<>'processing' or n.lease_token is distinct from p_lease or n.lease_until<=now() then raise exception 'Stale notification lease'; end if;
 if n.channel='resend' then
  if n.recipient_reference='operations' and n.event_type like 'admin\_%' escape '\' then
   recipient:='kjm.moto.rental@gmail.com';
  elsif n.recipient_reference='guest:'||n.booking_id::text then
   select email into recipient from public.guest_booking_contacts where booking_id=n.booking_id;
  else
  select u.email into recipient from auth.users u join public.customers c on c.auth_user_id=u.id join public.bookings b on b.customer_id=c.id where b.id=n.booking_id and u.id::text=n.recipient_reference and u.email_confirmed_at is not null and lower(btrim(u.email))=lower(btrim(c.email));
  end if;
 end if;
 return jsonb_build_object('recipient',recipient);
end; $$;


create or replace function public.notification_prepare(p_id uuid,p_lease uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.notification_outbox%rowtype; recipient text; s public.notification_settings%rowtype;
begin
 select * into n from public.notification_outbox where id=p_id for update;
 if n.id is null or p_lease is null or n.status<>'processing' or n.lease_token is distinct from p_lease or n.lease_until<=now() then raise exception 'Stale notification lease'; end if;
 select * into s from public.notification_settings where id;
 if not (n.event_type=any(s.enabled_events)) or not private.kjm_notification_eligible(n) or (not n.simulated and not (case n.channel when 'telegram' then s.telegram_enabled else s.resend_enabled end)) then
  update public.notification_outbox set status='cancelled',last_error='stale_event',lease_token=null,lease_until=null where id=n.id; return null;
 end if;
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid request fingerprint'; end if;
 if n.request_hash is not null and n.request_hash<>p_hash then
  update public.notification_outbox set status='failed_permanently',last_error='request_changed',lease_token=null,lease_until=null where id=n.id;return null;
 end if;
 if n.channel='resend' then
  if n.recipient_reference='operations' and n.event_type like 'admin\_%' escape '\' then
   recipient:='kjm.moto.rental@gmail.com';
  elsif n.recipient_reference='guest:'||n.booking_id::text then
   select email into recipient from public.guest_booking_contacts where booking_id=n.booking_id;
  else
  select u.email into recipient from auth.users u join public.customers c on c.auth_user_id=u.id join public.bookings b on b.customer_id=c.id where b.id=n.booking_id and u.id::text=n.recipient_reference and u.email_confirmed_at is not null and lower(btrim(u.email))=lower(btrim(c.email));
  end if;
  if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
   update public.notification_outbox set status='failed_permanently',last_error='invalid_recipient',lease_token=null,lease_until=null where id=n.id;return null;
  end if;
 end if;
 update public.notification_outbox set request_hash=p_hash where id=n.id;
 return jsonb_build_object('recipient',recipient,'lease',n.lease_token,'simulated',n.simulated);
end; $$;

create or replace function private.capture_kjm_finalized_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.bookings where id=new.booking_id and status in ('pending','submitted')) then
  perform private.enqueue_kjm_notification(new.booking_id,'booking_requested','request:'||new.booking_id);
 end if;
 if exists(select 1 from public.verification_documents where booking_id=new.booking_id and replaced_at is null) then
  perform private.enqueue_kjm_notification(new.booking_id,'documents_received','documents-received:'||new.booking_id);
 end if;
 return new;
exception when others then
 begin insert into public.notification_generation_errors(booking_id,source,sql_state,event_type,staff_only) values(new.booking_id,'finalized_request',sqlstate,'documents_received',false);exception when others then null;end;
 return new;
end; $$;
commit;
