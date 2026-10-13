-- PREPARED ONLY. Apply manually to a disposable/test project first.
-- Foundation only: no Checkout/webhook endpoints and no public activation.
-- Never insert these receipts into payment_events or count them toward handover.
begin;

create table public.paymongo_test_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 migration_verified boolean not null default false,
 webhook_verified boolean not null default false,
 reconciliation_verified boolean not null default false,
 concurrency_verified boolean not null default false,
 check(not enabled or (migration_verified and webhook_verified and reconciliation_verified and concurrency_verified))
);
insert into public.paymongo_test_settings(id) values(true);

create table public.paymongo_test_checkouts (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null unique references public.bookings(id) on delete restrict,
 customer_user_id uuid not null references auth.users(id) on delete restrict,
 idempotency_key uuid not null unique,
 amount_centavos bigint not null check(amount_centavos>0),
 currency text not null default 'PHP' check(currency='PHP'),
 is_test boolean not null default true check(is_test),
 motorcycle_unit_id uuid not null references public.motorcycle_units(id) on delete restrict,
 start_at timestamptz not null, end_at timestamptz not null,
 status text not null default 'prepared' check(status in ('prepared','session_created','paid','review_required')),
 checkout_session_id text unique,
 created_at timestamptz not null default now(),
 checkout_deadline timestamptz not null,
 check(end_at>start_at), check(checkout_deadline>created_at)
);
create table public.paymongo_test_receipts (
 checkout_id uuid primary key references public.paymongo_test_checkouts(id) on delete restrict,
 payment_id text not null unique,
 amount_centavos bigint not null check(amount_centavos>0),
 currency text not null check(currency='PHP'),
 livemode boolean not null check(not livemode),
 verified_at timestamptz not null default now()
);

alter table public.paymongo_test_settings enable row level security;
alter table public.paymongo_test_settings force row level security;
alter table public.paymongo_test_checkouts enable row level security;
alter table public.paymongo_test_checkouts force row level security;
alter table public.paymongo_test_receipts enable row level security;
alter table public.paymongo_test_receipts force row level security;
revoke all on public.paymongo_test_settings,public.paymongo_test_checkouts,public.paymongo_test_receipts from public,anon,authenticated,service_role;
grant select on public.paymongo_test_checkouts,public.paymongo_test_receipts to authenticated;
create policy paymongo_test_admin_read on public.paymongo_test_checkouts for select to authenticated using((select private.is_active_admin()));
create policy paymongo_test_receipts_admin_read on public.paymongo_test_receipts for select to authenticated using((select private.is_active_admin()));

-- Called only by a future trusted server AFTER authenticating the supplied owner.
-- A lost create-session response must be reconciled; never create another session
-- for the same intent. One intent per booking is deliberately permanent.
create function public.prepare_paymongo_test_checkout(p_booking_id uuid,p_owner uuid,p_idempotency_key uuid)
returns public.paymongo_test_checkouts language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; previous public.paymongo_test_checkouts%rowtype; owner_id uuid;
begin
 if not exists(select 1 from public.paymongo_test_settings where enabled) then raise exception 'PayMongo test checkout is disabled'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 select auth_user_id into owner_id from public.customers where id=b.customer_id;
 if b.id is null or b.is_test is distinct from true or p_owner is null or owner_id is distinct from p_owner or p_idempotency_key is null then raise exception 'Owned test booking required'; end if;
 select * into previous from public.paymongo_test_checkouts where booking_id=b.id;
 if found then
  if previous.idempotency_key is distinct from p_idempotency_key then raise exception 'Checkout already exists; reconcile existing intent'; end if;
  return previous;
 end if;
 if b.status<>'confirmed' or b.motorcycle_unit_id is null or b.end_at<=now() or (b.expires_at is not null and b.expires_at<=now())
 or not exists(select 1 from public.booking_terms_acceptances where booking_id=b.id)
 then raise exception 'Finalized, confirmed, reserved test booking required'; end if;
 if exists(select 1 from public.payment_intents where booking_id=b.id and status in ('requires_action','processing','succeeded'))
 or exists(select 1 from public.payment_events where booking_id=b.id) then raise exception 'Existing rental payment prevents test checkout'; end if;
 insert into public.paymongo_test_checkouts(booking_id,customer_user_id,idempotency_key,amount_centavos,motorcycle_unit_id,start_at,end_at,checkout_deadline)
 values(b.id,p_owner,p_idempotency_key,round(b.quoted_total_php*100)::bigint,b.motorcycle_unit_id,b.start_at,b.end_at,least(now()+interval '30 minutes',b.end_at)) returning * into previous;
 return previous;
end; $$;

-- Server stores the reconciled session identity before accepting a receipt.
create function public.attach_paymongo_test_session(p_checkout_id uuid,p_session_id text)
returns void language plpgsql security definer set search_path='' as $$
declare c public.paymongo_test_checkouts%rowtype;
begin
 select * into c from public.paymongo_test_checkouts where id=p_checkout_id for update;
 if c.id is null or p_session_id is null or p_session_id !~ '^cs_[A-Za-z0-9]+$' then raise exception 'Invalid session'; end if;
 if c.checkout_session_id is not null then
  if c.checkout_session_id<>p_session_id then raise exception 'Session identity is immutable'; end if;
  return;
 end if;
 update public.paymongo_test_checkouts set checkout_session_id=p_session_id,status='session_created' where id=c.id;
end; $$;

-- Input must come from server-side PayMongo retrieval, after signature verification
-- for webhook calls. This RPC itself does NOT authenticate a PayMongo payload.
create function public.settle_paymongo_test_checkout(p_session_id text,p_payment_id text,p_amount_centavos bigint,p_currency text,p_livemode boolean)
returns text language plpgsql security definer set search_path='' as $$
declare c public.paymongo_test_checkouts%rowtype; b public.bookings%rowtype; r public.paymongo_test_receipts%rowtype; booking uuid; result text;
begin
 select booking_id into booking from public.paymongo_test_checkouts where checkout_session_id=p_session_id;
 select * into b from public.bookings where id=booking for update;
 select * into c from public.paymongo_test_checkouts where booking_id=booking for update;
 if c.id is null or p_livemode is distinct from false or p_currency is distinct from 'PHP' or p_amount_centavos is distinct from c.amount_centavos or p_payment_id is null or p_payment_id !~ '^pay_[A-Za-z0-9]+$' then raise exception 'Invalid verified test receipt'; end if;
 select * into r from public.paymongo_test_receipts where checkout_id=c.id;
 if found then
  if r.payment_id<>p_payment_id then raise exception 'Different payment already settled; investigate duplicate'; end if;
  return c.status;
 end if;
 result:=case when b.is_test and b.status='confirmed' and b.motorcycle_unit_id=c.motorcycle_unit_id
  and b.start_at=c.start_at and b.end_at=c.end_at and round(b.quoted_total_php*100)::bigint=c.amount_centavos
  and now()<c.checkout_deadline and b.end_at>now() and (b.expires_at is null or b.expires_at>now())
  then 'paid' else 'review_required' end;
 insert into public.paymongo_test_receipts(checkout_id,payment_id,amount_centavos,currency,livemode) values(c.id,p_payment_id,p_amount_centavos,p_currency,p_livemode);
 update public.paymongo_test_checkouts set status=result where id=c.id;
 -- Never confirm/revive a booking or modify cash/deposit/real financial records.
 return result;
end; $$;

-- Serialize offline payment insertion with preparation via the booking row lock.
create function private.guard_paymongo_test_cash_conflict() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.bookings where id=new.booking_id for update;
 if exists(select 1 from public.paymongo_test_checkouts where booking_id=new.booking_id) then raise exception 'Test checkout exists; offline rental payment is blocked for this test booking'; end if;
 return new;
end; $$;
create trigger paymongo_test_cash_conflict before insert on public.payment_intents for each row execute function private.guard_paymongo_test_cash_conflict();

create function private.guard_paymongo_test_booking_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.paymongo_test_checkouts where booking_id=old.id)
 and (new.quoted_total_php is distinct from old.quoted_total_php or new.motorcycle_unit_id is distinct from old.motorcycle_unit_id
 or new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at or new.customer_id is distinct from old.customer_id
 or new.is_test is distinct from old.is_test) then raise exception 'Test checkout reservation and price are immutable'; end if;
 return new;
end; $$;
create trigger paymongo_test_booking_snapshot before update on public.bookings for each row execute function private.guard_paymongo_test_booking_snapshot();
revoke all on function private.guard_paymongo_test_booking_snapshot() from public,anon,authenticated,service_role;

-- Immutable receipt ledger; direct writes are unavailable even to service_role.
create trigger paymongo_test_receipts_immutable before update or delete on public.paymongo_test_receipts for each row execute function private.guard_rental_immutable();
revoke all on function private.guard_paymongo_test_cash_conflict() from public,anon,authenticated,service_role;
revoke all on function public.prepare_paymongo_test_checkout(uuid,uuid,uuid),public.attach_paymongo_test_session(uuid,text),public.settle_paymongo_test_checkout(text,text,bigint,text,boolean) from public,anon,authenticated;
grant execute on function public.prepare_paymongo_test_checkout(uuid,uuid,uuid),public.attach_paymongo_test_session(uuid,text),public.settle_paymongo_test_checkout(text,text,bigint,text,boolean) to service_role;
commit;
