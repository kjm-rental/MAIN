-- Risk status is independent of authorized identity approval and booking confirmation.
-- Apply to isolated TEST only; production application is not authorized.
begin;
do $$ begin
 if to_regprocedure('public.record_verification_prescreen(uuid,uuid,uuid[],jsonb)') is null
 or to_regprocedure('private.guard_identity_handover()') is null then raise exception 'Migration 029 required'; end if;
end $$;
alter table public.customer_verifications
 add column document_check_status text not null default 'PENDING' check(document_check_status in ('PENDING','DOCUMENT_CHECKS_PASSED','MANUAL_REVIEW_REQUIRED','CORRECTION_REQUIRED')),
 add column document_risk_level integer check(document_risk_level between 1 and 3),
 add column document_review_reasons jsonb not null default '[]' check(jsonb_typeof(document_review_reasons)='array'),
 add column document_check_id uuid;

create function private.clear_document_risk() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.replaced_at is not distinct from old.replaced_at then return new; end if;
 update public.customer_verifications set document_check_status='PENDING',document_risk_level=null,document_review_reasons='[]',document_check_id=null where id=new.verification_id;
 return new;
end $$;
create trigger zz_document_risk_invalidated after insert or update of replaced_at on public.verification_documents for each row execute function private.clear_document_risk();
revoke all on function private.clear_document_risk() from public,anon,authenticated;
create or replace function public.record_verification_prescreen(p_booking_id uuid,p_owner_id uuid,p_document_ids uuid[],p_summary jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare verification uuid; actual uuid[]; supplied uuid[]; risk text; level integer; check_id uuid; ev text; current_status text;
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
revoke all on function public.record_verification_prescreen(uuid,uuid,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.record_verification_prescreen(uuid,uuid,uuid[],jsonb) to service_role;
create or replace function private.kjm_notification_eligible(p public.notification_outbox) returns boolean language plpgsql stable security definer set search_path='' as $$
declare b public.bookings%rowtype;
begin
 if p.payload ? 'documentCheckId' then
  if not exists(select 1 from public.customer_verifications v join public.bookings risk_booking on risk_booking.id=v.booking_id where v.booking_id=p.booking_id and risk_booking.status in ('submitted','pending','confirmed') and v.document_check_id::text=p.payload->>'documentCheckId') then return false; end if;
  if p.event_type='document_checks_passed' then return exists(select 1 from public.customer_verifications where booking_id=p.booking_id and document_check_status='DOCUMENT_CHECKS_PASSED'); end if;
  if p.event_type='verification_action' then return exists(select 1 from public.customer_verifications where booking_id=p.booking_id and document_check_status='CORRECTION_REQUIRED' and overall_status not in ('approved','rejected')); end if;
  if p.event_type='verification_manual_review' then return exists(select 1 from public.customer_verifications where booking_id=p.booking_id and document_check_status='MANUAL_REVIEW_REQUIRED' and overall_status not in ('approved','rejected')); end if;
 end if;
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
 if not events <@ array['document_checks_passed','booking_requested','booking_approved','booking_rejected','verification_review','verification_manual_review','verification_action','booking_cancelled','pickup_reminder','pickup_summary','handover','return_reminder','overdue','returned','cash_payment','deposit_collected','deposit_returned','deposit_unresolved','id_custody','rental_completed','booking_modified','review_request','verification_approved','verification_rejected','admin_booking_requested','admin_booking_cancelled','admin_booking_modified','admin_pickup_reminder','admin_return_reminder','admin_overdue','admin_verification_review','admin_manual_review'] then raise exception 'Unsupported event category'; end if;
 update public.notification_settings set enabled_events=events,reminders_approved=coalesce((p_settings->>'reminders_approved')::boolean,false),
 pickup_hours=(p_settings->>'pickup_hours')::integer,return_hours=(p_settings->>'return_hours')::integer,morning_hour=(p_settings->>'morning_hour')::integer,updated_at=now(),updated_by=auth.uid() where id;
 -- External activation is deliberately unavailable in the browser UI.
 insert into public.audit_logs(actor_user_id,action,entity_type,metadata) values(auth.uid(),'notifications.preferences_saved','notification_settings',jsonb_build_object('event_count',cardinality(events)));
end; $$;

notify pgrst,'reload schema';
commit;
