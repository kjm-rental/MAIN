-- PREPARED ONLY. Review after 037 and existing live payment foundation 026.
-- Does not enable live payments or alter any historical financial row.
begin;
alter table public.paymongo_live_checkouts alter column customer_user_id drop not null;
alter table public.payment_events alter column recorded_by drop not null;
alter table public.payment_events add constraint payment_actor_or_provider check(recorded_by is not null or (event_type='payment' and method='future_gateway' and transaction_reference is not null and payment_intent_id is not null));
create function public.prepare_paymongo_guest_checkout(p_booking_id uuid,p_access_hash text,p_idempotency_key uuid)
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
 if b.status<>'confirmed' or b.motorcycle_unit_id is null or b.end_at<=now() or (b.expires_at is not null and b.expires_at<=now())
 or not exists(select 1 from public.booking_terms_acceptances where booking_id=b.id)
 or not exists(select 1 from public.booking_deposits where booking_id=b.id)
 then raise exception 'Finalized, confirmed, reserved live booking required'; end if;
 if exists(select 1 from public.payment_intents where booking_id=b.id and status in ('requires_action','processing','succeeded'))
 or exists(select 1 from public.payment_events where booking_id=b.id) then raise exception 'Existing rental payment prevents online checkout'; end if;
 insert into public.paymongo_live_checkouts(booking_id,customer_user_id,idempotency_key,amount_centavos,motorcycle_unit_id,start_at,end_at,checkout_deadline)
 values(b.id,null,p_idempotency_key,round(b.quoted_total_php*100)::bigint,b.motorcycle_unit_id,b.start_at,b.end_at,least(now()+interval '30 minutes',b.end_at)) returning * into previous;
 return previous;
end; $$;
revoke all on function public.prepare_paymongo_guest_checkout(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.prepare_paymongo_guest_checkout(uuid,text,uuid) to service_role;
create function public.get_guest_payment_checkout(p_booking_id uuid,p_access_hash text) returns uuid language plpgsql stable security definer set search_path='' as $$
begin if auth.role() is distinct from 'service_role' or not exists(select 1 from public.guest_booking_contacts where booking_id=p_booking_id and access_hash=p_access_hash) then raise exception 'Guest booking unavailable';end if;return (select id from public.paymongo_live_checkouts where booking_id=p_booking_id);end;$$;
revoke all on function public.get_guest_payment_checkout(uuid,text) from public,anon,authenticated;
grant execute on function public.get_guest_payment_checkout(uuid,text) to service_role;

-- Verified paid receipts use the existing outbox, dedupe key, templates and transport switches.
create function private.capture_qrph_paid() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='paid' and old.status is distinct from new.status and exists(select 1 from public.paymongo_live_receipts r join public.payment_events e on e.payment_intent_id=r.checkout_id where r.checkout_id=new.id and r.livemode and e.event_type='payment' and e.amount_centavos=new.amount_centavos) then
  perform private.enqueue_kjm_notification(new.booking_id,'payment_successful','qrph-paid:'||new.id,new.amount_centavos::integer);
 end if;return new;
end;$$;
create trigger qrph_paid_notification after update of status on public.paymongo_live_checkouts for each row execute function private.capture_qrph_paid();
update public.notification_settings set enabled_events=array_append(enabled_events,'payment_successful') where id and not ('payment_successful'=any(enabled_events));
create or replace function public.admin_save_notification_settings(p_settings jsonb) returns void language plpgsql security definer set search_path='' as $$
declare events text[];
begin
 if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
 select coalesce(array_agg(x),'{}') into events from jsonb_array_elements_text(p_settings->'enabled_events') x;
 if not events <@ array['payment_successful','document_checks_passed','booking_requested','booking_approved','booking_rejected','verification_review','verification_manual_review','verification_action','booking_cancelled','pickup_reminder','pickup_summary','handover','return_reminder','overdue','returned','cash_payment','deposit_collected','deposit_returned','deposit_unresolved','id_custody','rental_completed','booking_modified','review_request','verification_approved','verification_rejected','admin_booking_requested','admin_booking_cancelled','admin_booking_modified','admin_pickup_reminder','admin_return_reminder','admin_overdue','admin_verification_review','admin_manual_review'] then raise exception 'Unsupported event category'; end if;
 update public.notification_settings set enabled_events=events,reminders_approved=coalesce((p_settings->>'reminders_approved')::boolean,false),
 pickup_hours=(p_settings->>'pickup_hours')::integer,return_hours=(p_settings->>'return_hours')::integer,morning_hour=(p_settings->>'morning_hour')::integer,updated_at=now(),updated_by=auth.uid() where id;
 -- External activation is deliberately unavailable in the browser UI.
 insert into public.audit_logs(actor_user_id,action,entity_type,metadata) values(auth.uid(),'notifications.preferences_saved','notification_settings',jsonb_build_object('event_count',cardinality(events)));
end; $$;
commit;
