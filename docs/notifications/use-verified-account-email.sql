-- PREPARED ONLY. Canonical recipient is the same booking owner's VERIFIED Auth email.
-- Contact-field changes never authorize a different recipient. No record backfill or grants changed.
begin;
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
commit;
