-- PREPARED ONLY. Requires 001–021. External delivery defaults OFF.
-- No changes to booking/payment/deposit policies; no provider calls in transactions.
create table public.notification_settings (
 id boolean primary key default true check(id),
 telegram_enabled boolean not null default false,
 resend_enabled boolean not null default false,
 enabled_events text[] not null default array['booking_requested','booking_approved','booking_rejected','verification_review','verification_action','booking_cancelled','pickup_reminder','pickup_summary','handover','return_reminder','overdue','returned','cash_payment','deposit_collected','deposit_returned','deposit_unresolved','id_custody'],
 reminders_approved boolean not null default false,
 pickup_hours integer not null default 24 check(pickup_hours between 1 and 168),
 return_hours integer not null default 24 check(return_hours between 1 and 168),
 morning_hour integer not null default 8 check(morning_hour between 0 and 23),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete restrict
);
insert into public.notification_settings(id) values(true);
create table public.notification_outbox (
 id uuid primary key default gen_random_uuid(), event_key text not null,
 booking_id uuid not null references public.bookings(id) on delete restrict,
 booking_reference text not null, event_type text not null,
 channel text not null check(channel in ('telegram','resend')),
 recipient_reference text not null, template_version integer not null default 1 check(template_version=1),
 payload jsonb not null, is_test boolean not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','retry_scheduled','failed_permanently','cancelled')),
 attempt_count integer not null default 0 check(attempt_count between 0 and 6),
 manual_retry_count integer not null default 0 check(manual_retry_count between 0 and 3),
 available_at timestamptz not null default now(), created_at timestamptz not null default now(),
 first_attempt_at timestamptz, last_attempt_at timestamptz, delivered_at timestamptz,
 lease_token uuid, lease_until timestamptz, request_hash text, provider_reference text,
 last_error text check(last_error in ('transient','rate_limited','invalid_recipient','provider_rejected','delivery_ambiguous','idempotency_window_expired','request_changed','lease_expired','stale_event','disabled','configuration','cancelled','test_only','unsupported_template')),
 simulated boolean not null default false,
 unique(event_key,channel,recipient_reference)
);
create index notification_outbox_work_idx on public.notification_outbox(status,available_at);
create index notification_outbox_history_idx on public.notification_outbox(created_at desc);
create table public.notification_generation_errors (
 id uuid primary key default gen_random_uuid(), booking_id uuid references public.bookings(id) on delete restrict,
 source text not null, sql_state text not null, event_key text, event_type text, amount_centavos integer, staff_only boolean, recovered_at timestamptz, created_at timestamptz not null default now()
);
-- UUID keys: no new sequences. Revoke inherited table/function default grants.
alter table public.notification_settings enable row level security;
alter table public.notification_settings force row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_outbox force row level security;
alter table public.notification_generation_errors enable row level security;
alter table public.notification_generation_errors force row level security;
revoke all on public.notification_settings,public.notification_outbox,public.notification_generation_errors from public,anon,authenticated,service_role;
grant select on public.notification_settings,public.notification_outbox,public.notification_generation_errors to authenticated;
create policy notification_settings_admin_read on public.notification_settings for select to authenticated using((select private.is_active_admin()));
create policy notification_outbox_admin_read on public.notification_outbox for select to authenticated using((select private.is_active_admin()));
create policy notification_errors_admin_read on public.notification_generation_errors for select to authenticated using((select private.is_active_admin()));

create function private.enqueue_kjm_notification(p_booking uuid,p_event text,p_key text,p_amount integer default null,p_staff_only boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; d public.booking_deposits%rowtype; customer_auth uuid; content jsonb; ch text;
begin
 select * into b from public.bookings where id=p_booking;
 if b.id is null then return; end if;
 select * into d from public.booking_deposits where booking_id=b.id;
 select auth_user_id into customer_auth from public.customers where id=b.customer_id;
 content:=jsonb_build_object('bookingId',b.id,'reference',b.booking_reference,'motorcycle',coalesce((select display_name from public.motorcycle_models where id=b.motorcycle_model_id),'Motorcycle'),
 'pickupAt',b.start_at,'returnAt',b.end_at,'rentalCentavos',b.total_centavos,'depositOption',coalesce(d.option,'unconfirmed'),
 'depositCentavos',d.required_centavos,'amountCentavos',p_amount,'status',b.status);
 foreach ch in array array['telegram','resend'] loop
  if ch='resend' and (p_staff_only or customer_auth is null) then continue; end if;
  insert into public.notification_outbox(event_key,booking_id,booking_reference,event_type,channel,recipient_reference,payload,is_test)
  values(p_key,b.id,b.booking_reference,p_event,ch,case when ch='telegram' then 'operations' else customer_auth::text end,content,b.is_test)
  on conflict(event_key,channel,recipient_reference) do nothing;
 end loop;
end; $$;
revoke all on function private.enqueue_kjm_notification(uuid,text,text,integer,boolean) from public,anon,authenticated,service_role;

create function private.capture_kjm_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare bid uuid; ev text; key text; amount integer; staff boolean:=false;
begin
 if tg_table_name='booking_deposits' then
  bid:=new.booking_id; ev:='booking_requested';key:='request:'||bid;
 elsif tg_table_name='bookings' then
  if new.status is not distinct from old.status then return new; end if;
  bid:=new.id;ev:=case new.status when 'confirmed' then 'booking_approved' when 'rejected' then 'booking_rejected' when 'cancelled' then 'booking_cancelled' else null end;
  key:='status:'||bid||':'||new.status;
 elsif tg_table_name='verification_documents' then
  if new.replaced_at is not null then return new; end if;
  bid:=new.booking_id;ev:='verification_review';key:='document-review:'||new.id;staff:=true;
 elsif tg_table_name='customer_verifications' then
  if new.overall_status is not distinct from old.overall_status or new.overall_status<>'resubmission_required' then return new; end if;
  bid:=new.booking_id;ev:='verification_action';key:='verification-action:'||new.id||':'||extract(epoch from new.updated_at)::text;
 elsif tg_table_name='payment_events' then
  if new.event_type<>'payment' or new.method<>'cash' then return new; end if;
  bid:=new.booking_id;ev:='cash_payment';amount:=new.amount_centavos;key:='cash-payment:'||new.id;
 elsif tg_table_name='security_deposit_events' then
  bid:=new.booking_id;amount:=new.amount_centavos;key:='deposit:'||new.id;
  ev:=case new.event_type when 'cash_collected' then 'deposit_collected' when 'cash_returned' then 'deposit_returned' when 'case_opened' then 'deposit_unresolved' when 'id_received' then 'id_custody' when 'id_returned' then 'id_custody' else null end;
  staff:=ev in ('deposit_unresolved','id_custody');
 elsif tg_table_name='rental_inspections' then
  bid:=new.booking_id;ev:=case new.kind when 'handover' then 'handover' else 'returned' end;key:='inspection:'||new.id;
 end if;
 if ev is not null then perform private.enqueue_kjm_notification(bid,ev,key,amount,staff); end if;
 return new;
exception when others then
 -- No external failure may roll back a legitimate booking/payment. Save only SQLSTATE.
 begin insert into public.notification_generation_errors(booking_id,source,sql_state,event_key,event_type,amount_centavos,staff_only) values(bid,tg_table_name,sqlstate,key,ev,amount,staff); exception when others then null; end;
 return new;
end; $$;
revoke all on function private.capture_kjm_notification() from public,anon,authenticated,service_role;
create trigger kjm_notification_request after insert on public.booking_deposits for each row execute function private.capture_kjm_notification();
create trigger kjm_notification_status after update of status on public.bookings for each row execute function private.capture_kjm_notification();
create trigger kjm_notification_document after insert on public.verification_documents for each row execute function private.capture_kjm_notification();
create trigger kjm_notification_verification after update of overall_status on public.customer_verifications for each row execute function private.capture_kjm_notification();
create trigger kjm_notification_payment after insert on public.payment_events for each row execute function private.capture_kjm_notification();
create trigger kjm_notification_deposit after insert on public.security_deposit_events for each row execute function private.capture_kjm_notification();
create trigger kjm_notification_inspection after insert on public.rental_inspections for each row execute function private.capture_kjm_notification();

create function private.kjm_notification_eligible(p public.notification_outbox) returns boolean language plpgsql stable security definer set search_path='' as $$
declare b public.bookings%rowtype;
begin
 select * into b from public.bookings where id=p.booking_id;
 if b.id is null then return false; end if;
 if p.event_type in ('pickup_reminder','pickup_summary') then return b.status='confirmed' and b.start_at>now() and (p.payload->>'pickupAt')::timestamptz=b.start_at; end if;
 if p.event_type='return_reminder' then return b.status='active' and b.end_at>now() and (p.payload->>'returnAt')::timestamptz=b.end_at; end if;
 if p.event_type='overdue' then return b.status='active' and b.end_at<now() and (p.payload->>'returnAt')::timestamptz=b.end_at; end if;
 if p.event_type='booking_requested' then return b.status in ('pending','submitted'); end if;
 if p.event_type='booking_approved' then return b.status in ('confirmed','active'); end if;
 if p.event_type='verification_action' then return b.status in ('pending','submitted','confirmed') and exists(select 1 from public.customer_verifications where booking_id=b.id and overall_status='resubmission_required'); end if;
 if p.event_type='verification_review' then return b.status in ('pending','submitted','confirmed'); end if;
 -- Receipts and physical history remain valid after cancellation/expiry.
 return true;
end; $$;
revoke all on function private.kjm_notification_eligible(public.notification_outbox) from public,anon,authenticated,service_role;

create function public.admin_save_notification_settings(p_settings jsonb) returns void language plpgsql security definer set search_path='' as $$
declare events text[];
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 select coalesce(array_agg(x),'{}') into events from jsonb_array_elements_text(p_settings->'enabled_events') x;
 if not events <@ array['booking_requested','booking_approved','booking_rejected','verification_review','verification_action','booking_cancelled','pickup_reminder','pickup_summary','handover','return_reminder','overdue','returned','cash_payment','deposit_collected','deposit_returned','deposit_unresolved','id_custody'] then raise exception 'Unsupported event category'; end if;
 update public.notification_settings set enabled_events=events,reminders_approved=coalesce((p_settings->>'reminders_approved')::boolean,false),
 pickup_hours=(p_settings->>'pickup_hours')::integer,return_hours=(p_settings->>'return_hours')::integer,morning_hour=(p_settings->>'morning_hour')::integer,updated_at=now(),updated_by=auth.uid() where id;
 -- External activation is deliberately unavailable in the browser UI.
 insert into public.audit_logs(actor_user_id,action,entity_type,metadata) values(auth.uid(),'notifications.preferences_saved','notification_settings',jsonb_build_object('event_count',cardinality(events)));
end; $$;
revoke all on function public.admin_save_notification_settings(jsonb) from public,anon,service_role;
grant execute on function public.admin_save_notification_settings(jsonb) to authenticated;

create function public.admin_retry_notification(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare n public.notification_outbox%rowtype;
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 select * into n from public.notification_outbox where id=p_id for update;
 if n.id is null or n.channel<>'resend' or n.status not in ('failed_permanently','retry_scheduled') or n.last_error not in ('transient','rate_limited','configuration','invalid_recipient','disabled') or n.manual_retry_count>=3 or n.attempt_count>=6 then raise exception 'Notification is not eligible for manual retry'; end if;
 if n.first_attempt_at is not null and n.first_attempt_at<now()-interval '23 hours' then raise exception 'Provider idempotency window expired; review delivery manually'; end if;
 update public.notification_outbox set status='pending',available_at=now(),manual_retry_count=manual_retry_count+1,last_error=null where id=p_id;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'notifications.manual_retry','notification',p_id,jsonb_build_object('channel',n.channel));
end; $$;
revoke all on function public.admin_retry_notification(uuid) from public,anon,service_role;
grant execute on function public.admin_retry_notification(uuid) to authenticated;

create function public.notification_schedule_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare s public.notification_settings%rowtype; b record; local_now timestamp:=now() at time zone 'Asia/Manila'; before_count bigint;
begin
 select * into s from public.notification_settings where id;
 if not s.reminders_approved then return 0; end if;
 select count(*) into before_count from public.notification_outbox;
 for b in select * from public.bookings where status in ('confirmed','active') loop
  if b.status='confirmed' and b.start_at>now() and b.start_at<=now()+make_interval(hours=>s.pickup_hours) then
   perform private.enqueue_kjm_notification(b.id,'pickup_reminder','pickup:'||b.id||':'||extract(epoch from b.start_at)::text);
  end if;
  if b.status='active' and b.end_at>now() and b.end_at<=now()+make_interval(hours=>s.return_hours) then
   perform private.enqueue_kjm_notification(b.id,'return_reminder','return:'||b.id||':'||extract(epoch from b.end_at)::text);
  end if;
  if b.status='confirmed' and (b.start_at at time zone 'Asia/Manila')::date=local_now::date and extract(hour from local_now)>=s.morning_hour then
   perform private.enqueue_kjm_notification(b.id,'pickup_summary','morning:'||b.id||':'||local_now::date::text,null,true);
  end if;
  if b.status='active' and b.end_at<now() then
   perform private.enqueue_kjm_notification(b.id,'overdue','overdue:'||b.id||':'||extract(epoch from b.end_at)::text||':'||local_now::date::text,null,true);
  end if;
 end loop;
 return ((select count(*) from public.notification_outbox)-before_count)::integer;
end; $$;
revoke all on function public.notification_schedule_reminders() from public,anon,authenticated;
grant execute on function public.notification_schedule_reminders() to service_role;

create function public.notification_claim(p_channel text,p_mock boolean default false) returns setof public.notification_outbox language plpgsql security definer set search_path='' as $$
declare n public.notification_outbox%rowtype; s public.notification_settings%rowtype;
begin
 if p_channel not in ('telegram','resend') then raise exception 'Invalid channel'; end if;
 select * into s from public.notification_settings where id;
 if not p_mock and not (case p_channel when 'telegram' then s.telegram_enabled else s.resend_enabled end) then return; end if;
 -- A crashed worker may already have sent. Hold for review rather than risk duplicates.
 update public.notification_outbox set status='failed_permanently',last_error='lease_expired',lease_token=null,lease_until=null where channel=p_channel and status='processing' and lease_until<now();
 for n in select * from public.notification_outbox where channel=p_channel and status in ('pending','retry_scheduled') and available_at<=now() and attempt_count<6 and (not p_mock or is_test) and event_type=any(s.enabled_events) order by available_at,id for update skip locked limit 1 loop
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
revoke all on function public.notification_claim(text,boolean) from public,anon,authenticated;
grant execute on function public.notification_claim(text,boolean) to service_role;

create function public.notification_prepare(p_id uuid,p_lease uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
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
  select u.email into recipient from auth.users u join public.customers c on c.auth_user_id=u.id join public.bookings b on b.customer_id=c.id where b.id=n.booking_id and u.id::text=n.recipient_reference and u.email_confirmed_at is not null;
  if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
   update public.notification_outbox set status='failed_permanently',last_error='invalid_recipient',lease_token=null,lease_until=null where id=n.id;return null;
  end if;
 end if;
 update public.notification_outbox set request_hash=p_hash where id=n.id;
 return jsonb_build_object('recipient',recipient,'lease',n.lease_token,'simulated',n.simulated);
end; $$;
revoke all on function public.notification_prepare(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.notification_prepare(uuid,uuid,text) to service_role;

create function public.notification_finish(p_id uuid,p_lease uuid,p_result text,p_provider_reference text default null,p_retry_seconds integer default 60) returns void language plpgsql security definer set search_path='' as $$
declare n public.notification_outbox%rowtype;
begin
 select * into n from public.notification_outbox where id=p_id for update;
 if n.id is null or p_lease is null or n.status<>'processing' or n.lease_token is distinct from p_lease or n.lease_until<=now() then raise exception 'Stale notification lease'; end if;
 if p_result not in ('sent','transient','rate_limited','provider_rejected','delivery_ambiguous','configuration','invalid_recipient','request_changed','unsupported_template') then raise exception 'Invalid result'; end if;
 update public.notification_outbox set status=case when p_result='sent' then 'sent' when p_result in ('transient','rate_limited') and n.attempt_count<6 then 'retry_scheduled' else 'failed_permanently' end,
 delivered_at=case when p_result='sent' then now() else null end,last_error=case when p_result='sent' then null else p_result end,
 provider_reference=case when p_result='sent' then left(p_provider_reference,128) else null end,
 available_at=now()+make_interval(secs=>greatest(60,least(86400,coalesce(p_retry_seconds,60)))),lease_token=null,lease_until=null where id=p_id;
end; $$;
revoke all on function public.notification_finish(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.notification_finish(uuid,uuid,text,text,integer) to service_role;

-- Existing notification_events is historical metadata, not a trusted dispatch source.
-- No grants to enqueue arbitrary events, arbitrary email targets, or chat IDs.
-- No Cron job activated and no network extension needed. Authenticated server scheduler only.

create function public.notification_delivery_context(p_id uuid,p_lease uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n public.notification_outbox%rowtype; recipient text;
begin
 select * into n from public.notification_outbox where id=p_id;
 if n.id is null or p_lease is null or n.status<>'processing' or n.lease_token is distinct from p_lease or n.lease_until<=now() then raise exception 'Stale notification lease'; end if;
 if n.channel='resend' then
  select u.email into recipient from auth.users u join public.customers c on c.auth_user_id=u.id join public.bookings b on b.customer_id=c.id where b.id=n.booking_id and u.id::text=n.recipient_reference and u.email_confirmed_at is not null;
 end if;
 return jsonb_build_object('recipient',recipient);
end; $$;
revoke all on function public.notification_delivery_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.notification_delivery_context(uuid,uuid) to service_role;

create function public.admin_repair_notification_generation(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.notification_generation_errors%rowtype;
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 select * into e from public.notification_generation_errors where id=p_id for update;
 if e.id is null or e.recovered_at is not null or e.event_key is null or e.event_type is null then raise exception 'Generation failure is not recoverable'; end if;
 perform private.enqueue_kjm_notification(e.booking_id,e.event_type,e.event_key,e.amount_centavos,e.staff_only);
 update public.notification_generation_errors set recovered_at=now() where id=e.id;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'notifications.generation_repaired','notification_generation_error',e.id);
end; $$;
revoke all on function public.admin_repair_notification_generation(uuid) from public,anon,service_role;
grant execute on function public.admin_repair_notification_generation(uuid) to authenticated;

create function public.admin_audit_notification_mock_test(p_channel text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 if p_channel not in ('telegram','resend') then raise exception 'Invalid channel'; end if;
 insert into public.audit_logs(actor_user_id,action,entity_type,metadata) values(auth.uid(),'notifications.mock_test','notification',jsonb_build_object('channel',p_channel,'simulated',true));
end; $$;
revoke all on function public.admin_audit_notification_mock_test(text) from public,anon,service_role;
grant execute on function public.admin_audit_notification_mock_test(text) to authenticated;
