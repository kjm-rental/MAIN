-- PREPARED ONLY. DO NOT APPLY WITHOUT OWNER APPROVAL.
-- Requires production migrations 018,020,021,023. Does NOT require or install TEST migrations 024/025.
-- LIVE-only tables; authenticated TEST receipts can never satisfy these constraints.
-- Uses the existing finalized booking price and deposit snapshot; no price/policy/settings changes.
-- Existing cash records untouched. Cash flows without a live intent remain unchanged.
-- SQL/runtime/provider/concurrency verification is mandatory before readiness flags or activation.
begin;


create table public.paymongo_live_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 migration_verified boolean not null default false,
 webhook_verified boolean not null default false,
 reconciliation_verified boolean not null default false,
 concurrency_verified boolean not null default false,
 check(not enabled or (migration_verified and webhook_verified and reconciliation_verified and concurrency_verified))
);
insert into public.paymongo_live_settings(id) values(true);

create table public.paymongo_live_checkouts (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique references public.bookings(id) on delete restrict,
 customer_user_id uuid not null references auth.users(id) on delete restrict,
 idempotency_key uuid not null unique,
 amount_centavos bigint not null check(amount_centavos between 1 and 2147483647),
 currency text not null default 'PHP' check(currency='PHP'),
 is_test boolean not null default false check(not is_test),
 motorcycle_unit_id uuid not null references public.motorcycle_units(id) on delete restrict,
 start_at timestamptz not null, end_at timestamptz not null,
 status text not null default 'prepared' check(status in ('prepared','session_created','paid','review_required')),
 checkout_session_id text unique,
 created_at timestamptz not null default now(),
 checkout_deadline timestamptz not null,
 check(end_at>start_at), check(checkout_deadline>created_at)
);
create table public.paymongo_live_receipts (
 checkout_id uuid primary key references public.paymongo_live_checkouts(id) on delete restrict,
 payment_id text not null unique,
 amount_centavos bigint not null check(amount_centavos between 1 and 2147483647),
 currency text not null check(currency='PHP'),
 livemode boolean not null check(livemode),
 verified_at timestamptz not null default now()
);

alter table public.paymongo_live_settings enable row level security;
alter table public.paymongo_live_settings force row level security;
alter table public.paymongo_live_checkouts enable row level security;
alter table public.paymongo_live_checkouts force row level security;
alter table public.paymongo_live_receipts enable row level security;
alter table public.paymongo_live_receipts force row level security;
revoke all on public.paymongo_live_settings,public.paymongo_live_checkouts,public.paymongo_live_receipts from public,anon,authenticated,service_role;
grant select on public.paymongo_live_checkouts,public.paymongo_live_receipts to authenticated;
create policy paymongo_live_admin_read on public.paymongo_live_checkouts for select to authenticated using((select private.is_active_admin()));
create policy paymongo_live_receipts_admin_read on public.paymongo_live_receipts for select to authenticated using((select private.is_active_admin()));

-- Called only by trusted server AFTER authenticating the supplied owner.
-- A lost create-session response must be reconciled; never create another session
-- for the same intent. One intent per booking is deliberately permanent.
create function public.prepare_paymongo_live_checkout(p_booking_id uuid,p_owner uuid,p_idempotency_key uuid)
returns public.paymongo_live_checkouts language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; previous public.paymongo_live_checkouts%rowtype; owner_id uuid;
begin
 if not exists(select 1 from public.paymongo_live_settings where enabled) then raise exception 'PayMongo live checkout is disabled'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 select auth_user_id into owner_id from public.customers where id=b.customer_id;
 if b.id is null or b.is_test is distinct from false or p_owner is null or owner_id is distinct from p_owner or p_idempotency_key is null then raise exception 'Owned live booking required'; end if;
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
 values(b.id,p_owner,p_idempotency_key,round(b.quoted_total_php*100)::bigint,b.motorcycle_unit_id,b.start_at,b.end_at,least(now()+interval '30 minutes',b.end_at)) returning * into previous;
 return previous;
end; $$;

-- Server stores the reconciled session identity before accepting a receipt.
create function public.attach_paymongo_live_session(p_checkout_id uuid,p_session_id text)
returns void language plpgsql security definer set search_path='' as $$
declare c public.paymongo_live_checkouts%rowtype;
begin
 select * into c from public.paymongo_live_checkouts where id=p_checkout_id for update;
 if c.id is null or p_session_id is null or p_session_id !~ '^cs_[A-Za-z0-9]+$' then raise exception 'Invalid session'; end if;
 if c.checkout_session_id is not null then
  if c.checkout_session_id<>p_session_id then raise exception 'Session identity is immutable'; end if;
  return;
 end if;
 update public.paymongo_live_checkouts set checkout_session_id=p_session_id,status='session_created' where id=c.id;
end; $$;

-- Input must come from server-side LIVE PayMongo retrieval, after signature verification
-- for webhook calls. This RPC itself does NOT authenticate a PayMongo payload.
create function public.settle_paymongo_live_checkout(p_session_id text,p_payment_id text,p_amount_centavos bigint,p_currency text,p_livemode boolean)
returns text language plpgsql security definer set search_path='' as $$
declare c public.paymongo_live_checkouts%rowtype; b public.bookings%rowtype; r public.paymongo_live_receipts%rowtype; booking uuid; result text;
begin
 select booking_id into booking from public.paymongo_live_checkouts where checkout_session_id=p_session_id;
 select * into b from public.bookings where id=booking for update;
 select * into c from public.paymongo_live_checkouts where booking_id=booking for update;
 if c.id is null or p_livemode is distinct from true or p_currency is distinct from 'PHP' or p_amount_centavos is distinct from c.amount_centavos or p_payment_id is null or p_payment_id !~ '^pay_[A-Za-z0-9]+$' then raise exception 'Invalid verified live receipt'; end if;
 select * into r from public.paymongo_live_receipts where checkout_id=c.id;
 if found then
  if r.payment_id<>p_payment_id then raise exception 'Different payment already settled; investigate duplicate'; end if;
  return c.status;
 end if;
 result:=case when not b.is_test and b.status='confirmed' and b.motorcycle_unit_id=c.motorcycle_unit_id
  and b.start_at=c.start_at and b.end_at=c.end_at and round(b.quoted_total_php*100)::bigint=c.amount_centavos
  and now()<c.checkout_deadline and b.end_at>now() and (b.expires_at is null or b.expires_at>now())
  then 'paid' else 'review_required' end;
 insert into public.paymongo_live_receipts(checkout_id,payment_id,amount_centavos,currency,livemode) values(c.id,p_payment_id,p_amount_centavos,p_currency,p_livemode);
 if result='paid' then
  insert into public.payment_intents(id,booking_id,idempotency_key,kind,amount_centavos,status,provider,provider_reference,request_fingerprint,is_test,created_by)
  values(c.id,c.booking_id,c.id,'charge',c.amount_centavos::integer,'succeeded','paymongo',p_payment_id,jsonb_build_object('checkout_session_id',p_session_id,'livemode',true),false,c.customer_user_id);
  insert into public.payment_attempts(payment_intent_id,attempt_number,status,provider_reference,is_test,completed_at)
  values(c.id,1,'succeeded',p_payment_id,false,now());
  insert into public.payment_events(booking_id,payment_intent_id,event_type,amount_centavos,method,transaction_reference,occurred_at,recorded_by,idempotency_key,is_test)
  values(c.booking_id,c.id,'payment',c.amount_centavos::integer,'future_gateway',p_payment_id,now(),c.customer_user_id,c.id,false);
 end if;
 update public.paymongo_live_checkouts set status=result where id=c.id;
 -- Never revive/confirm a booking; deposit custody and document checks remain unchanged.
 return result;
end; $$;

-- Serialize offline payment insertion with preparation via the booking row lock.
create function private.guard_paymongo_live_cash_conflict() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.bookings where id=new.booking_id for update;
 if new.kind='charge' and exists(select 1 from public.paymongo_live_checkouts c where c.booking_id=new.booking_id) and not coalesce((new.provider='paymongo' and new.idempotency_key=new.id and exists(select 1 from public.paymongo_live_checkouts c where c.id=new.id and c.booking_id=new.booking_id and c.amount_centavos=new.amount_centavos and not new.is_test)),false) then raise exception 'Test checkout exists; offline rental payment is blocked for this live booking'; end if;
 return new;
end; $$;
create trigger paymongo_live_cash_conflict before insert on public.payment_intents for each row execute function private.guard_paymongo_live_cash_conflict();

create function private.guard_paymongo_live_booking_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.paymongo_live_checkouts where booking_id=old.id)
 and (new.quoted_total_php is distinct from old.quoted_total_php or new.motorcycle_unit_id is distinct from old.motorcycle_unit_id
 or new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at or new.customer_id is distinct from old.customer_id
 or new.is_test is distinct from old.is_test) then raise exception 'Test checkout reservation and price are immutable'; end if;
 return new;
end; $$;
create trigger paymongo_live_booking_snapshot before update on public.bookings for each row execute function private.guard_paymongo_live_booking_snapshot();
revoke all on function private.guard_paymongo_live_booking_snapshot() from public,anon,authenticated,service_role;

-- Immutable receipt ledger; direct writes are unavailable even to service_role.
create trigger paymongo_live_receipts_immutable before update or delete on public.paymongo_live_receipts for each row execute function private.guard_rental_immutable();
revoke all on function private.guard_paymongo_live_cash_conflict() from public,anon,authenticated,service_role;
revoke all on function public.prepare_paymongo_live_checkout(uuid,uuid,uuid),public.attach_paymongo_live_session(uuid,text),public.settle_paymongo_live_checkout(text,text,bigint,text,boolean) from public,anon,authenticated;
grant execute on function public.prepare_paymongo_live_checkout(uuid,uuid,uuid),public.attach_paymongo_live_session(uuid,text),public.settle_paymongo_live_checkout(text,text,bigint,text,boolean) to service_role;

update public.paymongo_live_settings set enabled=false,migration_verified=false,webhook_verified=false,reconciliation_verified=false,concurrency_verified=false;
alter table public.paymongo_live_checkouts add column creation_claimed_at timestamptz;
create table public.paymongo_live_webhook_events (
 event_id text primary key check(event_id ~ '^evt_[A-Za-z0-9]+$'),
 payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
 completed_at timestamptz not null default now()
);
alter table public.paymongo_live_webhook_events enable row level security;
alter table public.paymongo_live_webhook_events force row level security;
revoke all on public.paymongo_live_webhook_events from public,anon,authenticated,service_role;
create trigger paymongo_live_webhook_immutable before update or delete on public.paymongo_live_webhook_events for each row execute function private.guard_rental_immutable();

-- One irreversible claim BEFORE the external POST. A timeout/crash requires
-- provider-side recovery, never a second POST; no assumption of API idempotency.
create function public.claim_paymongo_live_creation(p_checkout_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare booking uuid; b public.bookings%rowtype; c public.paymongo_live_checkouts%rowtype;
begin
 if not exists(select 1 from public.paymongo_live_settings where enabled) then raise exception 'PayMongo disabled'; end if;
 select booking_id into booking from public.paymongo_live_checkouts where id=p_checkout_id;
 select * into b from public.bookings where id=booking for update;
 select * into c from public.paymongo_live_checkouts where id=p_checkout_id for update;
 if c.id is null or b.is_test is distinct from false or b.status<>'confirmed' or b.end_at<=now()
 or (b.expires_at is not null and b.expires_at<=now()) or c.checkout_deadline<=now() then raise exception 'Reservation no longer payable'; end if;
 if c.creation_claimed_at is not null or c.checkout_session_id is not null then return false; end if;
 update public.paymongo_live_checkouts set creation_claimed_at=now() where id=c.id;
 return true;
end; $$;

-- No direct service table privileges. Server authenticates owner/cron/webhook.
create function public.read_paymongo_live_checkout(p_checkout_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(c)||jsonb_build_object('reservation_active',not b.is_test and b.status='confirmed'
 and b.motorcycle_unit_id=c.motorcycle_unit_id and b.start_at=c.start_at and b.end_at=c.end_at
 and round(b.quoted_total_php*100)::bigint=c.amount_centavos and b.end_at>now()
 and (b.expires_at is null or b.expires_at>now()))
 from public.paymongo_live_checkouts c join public.bookings b on b.id=c.booking_id where c.id=p_checkout_id;
$$;
create function public.list_paymongo_live_checkouts(p_after uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item order by id),'[]'::jsonb) from (
 select c.id,public.read_paymongo_live_checkout(c.id) item from public.paymongo_live_checkouts c
 where (p_after is null or c.id>p_after) and c.creation_claimed_at is not null order by c.id limit 5
 ) batch;
$$;
-- Event is marked complete only AFTER authoritative reconciliation/settlement.
-- Concurrent deliveries may both retrieve; settlement itself is atomic/idempotent.
create function public.paymongo_live_event_completed(p_event_id text,p_hash text,p_complete boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
declare previous text;
begin
 if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid event identity'; end if;
 if p_complete then insert into public.paymongo_live_webhook_events(event_id,payload_sha256) values(p_event_id,p_hash) on conflict do nothing; end if;
 select payload_sha256 into previous from public.paymongo_live_webhook_events where event_id=p_event_id;
 if found and previous<>p_hash then raise exception 'Event identity reused with different payload'; end if;
 return previous is not null;
end; $$;
revoke all on function public.claim_paymongo_live_creation(uuid),public.read_paymongo_live_checkout(uuid),public.list_paymongo_live_checkouts(uuid),public.paymongo_live_event_completed(text,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_paymongo_live_creation(uuid),public.read_paymongo_live_checkout(uuid),public.list_paymongo_live_checkouts(uuid),public.paymongo_live_event_completed(text,text,boolean) to service_role;

-- Extend the cash-only rule ONLY for a matching immutable LIVE receipt.
create or replace function private.assert_cash_rental_receipt() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.event_type='payment' and new.method<>'cash' and not (
  new.method='future_gateway' and not new.is_test and exists(
   select 1 from public.paymongo_live_checkouts c join public.paymongo_live_receipts r on r.checkout_id=c.id
   join public.payment_intents i on i.id=c.id
   where c.id=new.payment_intent_id and c.booking_id=new.booking_id and not c.is_test and r.livemode
   and r.payment_id=new.transaction_reference and r.amount_centavos=new.amount_centavos
   and i.provider='paymongo' and i.status='succeeded' and i.provider_reference=r.payment_id
  )) then raise exception 'Verified cash or authenticated live gateway receipt required'; end if;
 return new;
end; $$;
revoke all on function private.assert_cash_rental_receipt() from public,anon,authenticated,service_role;

alter table public.paymongo_live_settings add column payment_methods text[] not null default array['qrph']::text[]
 check(cardinality(payment_methods)>0 and payment_methods <@ array['qrph','card']::text[]);
create function public.paymongo_live_ready() returns boolean language sql stable security definer set search_path='' as $$
 select enabled and migration_verified and webhook_verified and reconciliation_verified and concurrency_verified from public.paymongo_live_settings where id;
$$;
create function public.paymongo_live_methods() returns text[] language sql stable security definer set search_path='' as $$
 select payment_methods from public.paymongo_live_settings where id;
$$;
revoke all on function public.paymongo_live_ready(),public.paymongo_live_methods() from public,anon,authenticated;
grant execute on function public.paymongo_live_ready(),public.paymongo_live_methods() to service_role;

commit;
