-- PREPARED FOR MAIN SQL EDITOR. NOT APPLIED BY CODEX.
-- One transaction; stops if the installed finalize body differs from the reviewed baseline.
-- No existing booking, inventory, verification, payment or delivery-history records updated.
begin;
-- PREPARED ONLY. Verify installed finalize function matches the 023 baseline before applying.
-- Forward-looking function change only. NO updates/backfill to existing booking records.
-- All authentication, documents, terms, quote, inventory hold/lock, overlap and handover guards remain.
do $$ begin
 if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.finalize_booking_request(uuid,text,boolean)') and md5(prosrc) in ('7de73b7f3a12304c59b56055e089e487','7e38dc6cc494572bd5562d72ade8b98c')) then raise exception 'Installed finalize function differs from reviewed baseline; stop and compare before changing it'; end if;
end $$;
create or replace function public.finalize_booking_request(p_booking_id uuid,p_terms_version text,p_terms_accepted boolean)
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
 -- Eligible customer categories share booking confirmation; identity/licence review is unchanged.
 if v.customer_type in ('philippine_resident','international_visitor') then
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


-- PREPARED ONLY. Canonical recipient is the same booking owner's VERIFIED Auth email.
-- Contact-field changes never authorize a different recipient. No record backfill or grants changed.
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

   );
$$;

create or replace function public.notification_delivery_context(p_id uuid,p_lease uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n public.notification_outbox%rowtype; recipient text;
begin
 select * into n from public.notification_outbox where id=p_id;
 if n.id is null or p_lease is null or n.status<>'processing' or n.lease_token is distinct from p_lease or n.lease_until<=now() then raise exception 'Stale notification lease'; end if;
 if n.channel='resend' then
  if n.recipient_reference='operations' and n.event_type like 'admin\_%' escape '\' then
   recipient:='kjm.moto.rental@gmail.com';
  else
  select u.email into recipient from auth.users u join public.customers c on c.auth_user_id=u.id join public.bookings b on b.customer_id=c.id where b.id=n.booking_id and u.id::text=n.recipient_reference and u.email_confirmed_at is not null ;
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
  select u.email into recipient from auth.users u join public.customers c on c.auth_user_id=u.id join public.bookings b on b.customer_id=c.id where b.id=n.booking_id and u.id::text=n.recipient_reference and u.email_confirmed_at is not null ;
  end if;
  if recipient is null or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
   update public.notification_outbox set status='failed_permanently',last_error='invalid_recipient',lease_token=null,lease_until=null where id=n.id;return null;
  end if;
 end if;
 update public.notification_outbox set request_hash=p_hash where id=n.id;
 return jsonb_build_object('recipient',recipient,'lease',n.lease_token,'simulated',n.simulated);
end; $$;


-- PREPARED FOR APPROVAL ONLY; not applied.
-- First review diagnose-booking-notifications.sql. Do not replay already-sent/ambiguous messages.
-- Does not alter booking status, customer details, recipient binding, or delivery history.
do $$ begin
 if to_regprocedure('public.notification_runtime_status()') is null then raise exception '031 must already be installed'; end if;
end $$;
update public.notification_settings set telegram_enabled=true,updated_at=now()
where id and delivery_start_at is not null;

-- The existing local owner worker is configured; its database switch is enabled by this transaction.

create or replace function public.notification_runtime_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('guest_binding_ready',true,'resend_enabled',s.resend_enabled,
 'reminders_enabled',s.reminders_approved,'activation_recorded',s.delivery_start_at is not null,
 'telegram_enabled',s.telegram_enabled,'verified_account_recipient',true,
 'international_auto_confirmation',true)
 from public.notification_settings s where s.id;
$$;
revoke all on function public.notification_runtime_status() from public,anon,authenticated;
grant execute on function public.notification_runtime_status() to service_role;

commit;
select public.notification_runtime_status();
