-- PREPARED ONLY — do not apply without owner approval. Requires existing migrations through 026.
-- Reuses the existing outbox and grants; no changes to payment/business rules.

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
  bid:=new.booking_id;ev:='verification_review';key:='document-review:'||new.id;staff:=true;
 elsif tg_table_name='customer_verifications' then
  if new.overall_status is not distinct from old.overall_status or new.overall_status not in ('approved','rejected','resubmission_required','under_review') then return new; end if;
  bid:=new.booking_id;ev:=case when new.overall_status='approved' then 'verification_approved' when new.overall_status='rejected' then 'verification_rejected' when new.overall_status='under_review' then 'verification_manual_review' else 'verification_action' end;staff:=new.overall_status='under_review';key:='verification-action:'||new.id||':'||extract(epoch from new.updated_at)::text;
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
 if p.event_type='verification_review' then return b.status in ('pending','submitted','confirmed'); end if;
 if p.event_type='verification_approved' then return exists(select 1 from public.customer_verifications where booking_id=b.id and overall_status='approved' and identity_status='approved' and license_status='approved' and entitlement_status='approved' and international_status in ('approved','not_applicable'));  end if;
 if p.event_type='booking_modified' then return b.status='confirmed'; end if;
 if p.event_type in ('rental_completed','review_request') then return b.status='completed'; end if;
 -- Receipts and physical history remain valid after cancellation/expiry.
 return true;
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
  select u.email into recipient from auth.users u join public.customers c on c.auth_user_id=u.id join public.bookings b on b.customer_id=c.id where b.id=n.booking_id and u.id::text=n.recipient_reference and u.email_confirmed_at is not null;
  end if;
  if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
   update public.notification_outbox set status='failed_permanently',last_error='invalid_recipient',lease_token=null,lease_until=null where id=n.id;return null;
  end if;
 end if;
 update public.notification_outbox set request_hash=p_hash where id=n.id;
 return jsonb_build_object('recipient',recipient,'lease',n.lease_token,'simulated',n.simulated);
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
  select u.email into recipient from auth.users u join public.customers c on c.auth_user_id=u.id join public.bookings b on b.customer_id=c.id where b.id=n.booking_id and u.id::text=n.recipient_reference and u.email_confirmed_at is not null;
  end if;
 end if;
 return jsonb_build_object('recipient',recipient);
end; $$;
-- No backfill, network call, scheduler, payment enablement or provider activation.
-- Existing preferences are preserved. New categories are explicitly enabled at launch.
create function private.capture_kjm_email_modification() returns trigger language plpgsql security definer set search_path='' as $$
declare modification_key text:='modification:'||gen_random_uuid()::text;
begin
 if old.status='confirmed' and new.status='confirmed' and
  row(old.motorcycle_model_id,old.motorcycle_unit_id,old.start_at,old.end_at,old.total_centavos) is distinct from
  row(new.motorcycle_model_id,new.motorcycle_unit_id,new.start_at,new.end_at,new.total_centavos) then
  perform private.enqueue_kjm_notification(new.id,'booking_modified',modification_key);
 end if;
 return new;
exception when others then
 begin insert into public.notification_generation_errors(booking_id,source,sql_state,event_key,event_type,staff_only) values(new.id,'email_modification',sqlstate,modification_key,'booking_modified',false); exception when others then null; end;
 return new;
end; $$;
revoke all on function private.capture_kjm_email_modification() from public,anon,authenticated,service_role;
create trigger kjm_email_modification after update on public.bookings for each row execute function private.capture_kjm_email_modification();

-- A finalized request, not an unfinished deposit snapshot, is the request event.
create function private.capture_kjm_finalized_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.enqueue_kjm_notification(new.booking_id,'booking_requested','request:'||new.booking_id);
 return new;
exception when others then
 begin insert into public.notification_generation_errors(booking_id,source,sql_state,event_key,event_type,staff_only) values(new.booking_id,'finalized_request',sqlstate,'request:'||new.booking_id,'booking_requested',false); exception when others then null; end;
 return new;
end; $$;
revoke all on function private.capture_kjm_finalized_request() from public,anon,authenticated,service_role;
create trigger kjm_email_finalized_request after insert on public.booking_terms_acceptances for each row execute function private.capture_kjm_finalized_request();

create or replace function public.admin_save_notification_settings(p_settings jsonb) returns void language plpgsql security definer set search_path='' as $$
declare events text[];
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 select coalesce(array_agg(x),'{}') into events from jsonb_array_elements_text(p_settings->'enabled_events') x;
 if not events <@ array['booking_requested','booking_approved','booking_rejected','verification_review','verification_action','booking_cancelled','pickup_reminder','pickup_summary','handover','return_reminder','overdue','returned','cash_payment','deposit_collected','deposit_returned','deposit_unresolved','id_custody','rental_completed','booking_modified','review_request','verification_approved','verification_rejected','admin_booking_requested','admin_booking_cancelled','admin_booking_modified','admin_pickup_reminder','admin_return_reminder','admin_overdue','admin_verification_review','admin_manual_review'] then raise exception 'Unsupported event category'; end if;
 update public.notification_settings set enabled_events=events,reminders_approved=coalesce((p_settings->>'reminders_approved')::boolean,false),
 pickup_hours=(p_settings->>'pickup_hours')::integer,return_hours=(p_settings->>'return_hours')::integer,morning_hour=(p_settings->>'morning_hour')::integer,updated_at=now(),updated_by=auth.uid() where id;
 -- External activation is deliberately unavailable in the browser UI.
 insert into public.audit_logs(actor_user_id,action,entity_type,metadata) values(auth.uid(),'notifications.preferences_saved','notification_settings',jsonb_build_object('event_count',cardinality(events)));
end; $$;

-- Narrow best-effort wakeup: request/confirmation events for one owned booking.
create function public.notification_claim_booking(p_booking uuid,p_channel text,p_mock boolean default false) returns setof public.notification_outbox language plpgsql security definer set search_path='' as $$
declare n public.notification_outbox%rowtype; s public.notification_settings%rowtype;
begin
 if p_channel not in ('telegram','resend') then raise exception 'Invalid channel'; end if;
 select * into s from public.notification_settings where id;
 if not p_mock and not (case p_channel when 'telegram' then s.telegram_enabled else s.resend_enabled end) then return; end if;
 -- A crashed worker may already have sent. Hold for review rather than risk duplicates.
 update public.notification_outbox set status='failed_permanently',last_error='lease_expired',lease_token=null,lease_until=null where channel=p_channel and status='processing' and lease_until<now();
 for n in select * from public.notification_outbox where booking_id=p_booking and event_type in ('booking_requested','booking_approved','admin_booking_requested') and channel=p_channel and status in ('pending','retry_scheduled') and available_at<=now() and attempt_count<6 and (not p_mock or is_test) and event_type=any(s.enabled_events) order by available_at,id for update skip locked limit 3 loop
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
revoke all on function public.notification_claim_booking(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.notification_claim_booking(uuid,text,boolean) to service_role;
