-- Authorized 2026-10-26. Apply only to the verified MAIN project after dependency checks.
-- Does not enable delivery, change recipient ownership, reset failed rows, or send mail.
-- Requires 022 and 027; preserves existing function signatures and service-only grants.
begin;
do $$ begin
 if to_regprocedure('public.notification_claim(text,boolean)') is null
 or to_regprocedure('public.notification_claim_booking(uuid,text,boolean)') is null
 or to_regprocedure('public.record_verification_prescreen(uuid,uuid,uuid[],jsonb)') is null
 then raise exception 'Requires existing notification integration and migrations 029/030'; end if;
end $$;
alter table public.notification_settings add column if not exists delivery_start_at timestamptz;
create or replace function private.kjm_resend_recipient_bound(p public.notification_outbox)
returns boolean language sql stable security definer set search_path='' as $$
 select p.channel <> 'resend'
   or (p.recipient_reference='operations' and p.event_type like 'admin\_%' escape '\')
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
create or replace function public.notification_claim(p_channel text,p_mock boolean default false) returns setof public.notification_outbox language plpgsql security definer set search_path='' as $$
declare n public.notification_outbox%rowtype; s public.notification_settings%rowtype;
begin
 if p_channel not in ('telegram','resend') then raise exception 'Invalid channel'; end if;
 select * into s from public.notification_settings where id;
 if not p_mock and not (case p_channel when 'telegram' then s.telegram_enabled else s.resend_enabled end) then return; end if;
 -- A crashed worker may already have sent. Hold for review rather than risk duplicates.
 update public.notification_outbox set status='failed_permanently',last_error='lease_expired',lease_token=null,lease_until=null where channel=p_channel and status='processing' and lease_until<now();
 for n in select * from public.notification_outbox q where channel=p_channel and status in ('pending','retry_scheduled') and available_at<=now() and attempt_count<6 and (not p_mock or is_test) and event_type=any(s.enabled_events) and private.kjm_resend_recipient_bound(q) and not is_test and (s.delivery_start_at is null or q.created_at>=s.delivery_start_at) order by available_at,id for update skip locked limit 1 loop
  if not private.kjm_notification_eligible(n) then
   update public.notification_outbox set status='cancelled',last_error='stale_event' where id=n.id; continue;
  end if;
  if n.first_attempt_at<now()-interval '23 hours' then
   update public.notification_outbox set status='failed_permanently',last_error='idempotency_window_expired' where id=n.id;continue;
  end if;
  update public.notification_outbox set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempt_count=attempt_count+1,first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now(),simulated=p_mock where id=n.id returning * into n;
  return next n;
 end loop;
end; $$;

create or replace function public.notification_claim_booking(p_booking uuid,p_channel text,p_mock boolean default false) returns setof public.notification_outbox language plpgsql security definer set search_path='' as $$
declare n public.notification_outbox%rowtype; s public.notification_settings%rowtype;
begin
 if p_channel not in ('telegram','resend') then raise exception 'Invalid channel'; end if;
 select * into s from public.notification_settings where id;
 if not p_mock and not (case p_channel when 'telegram' then s.telegram_enabled else s.resend_enabled end) then return; end if;
 -- A crashed worker may already have sent. Hold for review rather than risk duplicates.
 update public.notification_outbox set status='failed_permanently',last_error='lease_expired',lease_token=null,lease_until=null where channel=p_channel and status='processing' and lease_until<now();
 for n in select * from public.notification_outbox q where booking_id=p_booking and event_type in ('booking_requested','booking_approved','admin_booking_requested') and channel=p_channel and status in ('pending','retry_scheduled') and available_at<=now() and attempt_count<6 and (not p_mock or is_test) and event_type=any(s.enabled_events) and private.kjm_resend_recipient_bound(q) and not is_test and (s.delivery_start_at is null or q.created_at>=s.delivery_start_at) order by available_at,id for update skip locked limit 3 loop
  if not private.kjm_notification_eligible(n) then
   update public.notification_outbox set status='cancelled',last_error='stale_event' where id=n.id; continue;
  end if;
  if n.first_attempt_at<now()-interval '23 hours' then
   update public.notification_outbox set status='failed_permanently',last_error='idempotency_window_expired' where id=n.id;continue;
  end if;
  update public.notification_outbox set status='processing',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempt_count=attempt_count+1,first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now(),simulated=p_mock where id=n.id returning * into n;
  return next n;
  return;
 end loop;
end; $$;

create or replace function public.notification_delivery_context(p_id uuid,p_lease uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n public.notification_outbox%rowtype; recipient text;
begin
 select * into n from public.notification_outbox where id=p_id;
 if n.id is null or p_lease is null or n.status<>'processing' or n.lease_token is distinct from p_lease or n.lease_until<=now() then raise exception 'Stale notification lease'; end if;
 if n.channel='resend' then
  if n.recipient_reference='operations' and n.event_type like 'admin\_%' escape '\' then
   recipient:='kjm.moto.rental@gmail.com';
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
-- Customer receipt follows finalized submission; initial uploads alone do not confirm a booking.
create or replace function private.capture_kjm_finalized_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.enqueue_kjm_notification(new.booking_id,'booking_requested','request:'||new.booking_id);
 if exists(select 1 from public.verification_documents where booking_id=new.booking_id and replaced_at is null) then
  perform private.enqueue_kjm_notification(new.booking_id,'documents_received','documents-received:'||new.booking_id);
 end if;
 return new;
exception when others then
 begin insert into public.notification_generation_errors(booking_id,source,sql_state,event_type,staff_only) values(new.booking_id,'finalized_request',sqlstate,'documents_received',false); exception when others then null; end;
 return new;
end; $$;
create function private.capture_kjm_document_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.replaced_at is null and exists(select 1 from public.booking_terms_acceptances where booking_id=new.booking_id) then
  perform private.enqueue_kjm_notification(new.booking_id,'documents_received','documents-received:'||new.id);
 end if;
 return new;
exception when others then
 begin insert into public.notification_generation_errors(booking_id,source,sql_state,event_type,staff_only) values(new.booking_id,'document_receipt',sqlstate,'documents_received',false); exception when others then null; end;
 return new;
end; $$;
revoke all on function private.capture_kjm_document_receipt() from public,anon,authenticated,service_role;
create trigger kjm_document_receipt after insert on public.verification_documents for each row execute function private.capture_kjm_document_receipt();

-- Instructions are only sent after an active reviewer records actual booking-specific details.
create table public.booking_pickup_instructions (
 booking_id uuid primary key references public.bookings(id),
 revision uuid not null default gen_random_uuid(), location text not null check(length(btrim(location)) between 1 and 1000),
 instructions text not null check(length(btrim(instructions)) between 1 and 2000),
 recorded_by uuid not null references auth.users(id), recorded_at timestamptz not null default now()
);
alter table public.booking_pickup_instructions enable row level security;
alter table public.booking_pickup_instructions force row level security;
revoke all on public.booking_pickup_instructions from public,anon,authenticated,service_role;
grant select on public.booking_pickup_instructions to authenticated;
create policy pickup_instructions_read on public.booking_pickup_instructions for select to authenticated using (
 (select private.is_active_admin()) or exists(select 1 from public.bookings b join public.customers c on c.id=b.customer_id where b.id=booking_id and c.auth_user_id=(select auth.uid()))
);
create function public.admin_record_pickup_instructions(p_booking uuid,p_location text,p_instructions text) returns void
language plpgsql security definer set search_path='' as $$
declare old_record public.booking_pickup_instructions%rowtype; rev uuid:=gen_random_uuid(); evkey text;
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 perform 1 from public.bookings where id=p_booking and status='confirmed' for update;
 if not found then raise exception 'Confirmed booking required'; end if;
 if length(btrim(p_location)) not between 1 and 1000 or length(btrim(p_instructions)) not between 1 and 2000 or p_location is null or p_instructions is null then raise exception 'Actual pickup location and instructions required'; end if;
 select * into old_record from public.booking_pickup_instructions where booking_id=p_booking;
 if old_record.location=btrim(p_location) and old_record.instructions=btrim(p_instructions) then return; end if;
 insert into public.booking_pickup_instructions(booking_id,revision,location,instructions,recorded_by)
 values(p_booking,rev,btrim(p_location),btrim(p_instructions),auth.uid())
 on conflict(booking_id) do update set revision=excluded.revision,location=excluded.location,instructions=excluded.instructions,recorded_by=excluded.recorded_by,recorded_at=now();
 evkey:='pickup-instructions:'||rev;
 perform private.enqueue_kjm_notification(p_booking,'pickup_instructions',evkey);
 update public.notification_outbox set payload=payload||jsonb_build_object('pickupLocation',btrim(p_location),'pickupInstructions',btrim(p_instructions),'pickupRevision',rev) where event_key=evkey;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'booking.pickup_instructions_recorded','bookings',p_booking,jsonb_build_object('revision',rev));
end; $$;
revoke all on function public.admin_record_pickup_instructions(uuid,text,text) from public,anon,service_role;
grant execute on function public.admin_record_pickup_instructions(uuid,text,text) to authenticated;

create or replace function private.kjm_notification_eligible(p public.notification_outbox) returns boolean language plpgsql stable security definer set search_path='' as $$
declare b public.bookings%rowtype;
begin
 if p.event_type='pickup_instructions' then return exists(
  select 1 from public.booking_pickup_instructions i join public.bookings b on b.id=i.booking_id
  where b.id=p.booking_id and b.status='confirmed' and b.start_at>now()
  and i.revision::text=p.payload->>'pickupRevision'
  and i.location=p.payload->>'pickupLocation' and i.instructions=p.payload->>'pickupInstructions'); end if;
 if p.event_type='documents_received' then return exists(select 1 from public.bookings b join public.booking_terms_acceptances t on t.booking_id=b.id where b.id=p.booking_id and b.status in ('submitted','pending','confirmed')); end if;
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

create or replace function public.notification_runtime_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('guest_binding_ready',true,'resend_enabled',s.resend_enabled,
 'reminders_enabled',s.reminders_approved,'activation_recorded',s.delivery_start_at is not null)
 from public.notification_settings s where s.id;
$$;
revoke all on function public.notification_runtime_status() from public,anon,authenticated;
grant execute on function public.notification_runtime_status() to service_role;
commit;
