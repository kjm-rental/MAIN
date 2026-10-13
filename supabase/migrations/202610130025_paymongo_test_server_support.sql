-- PREPARED ONLY. No activation, no production application. Requires 024.
begin;
update public.paymongo_test_settings set enabled=false,migration_verified=false,webhook_verified=false,reconciliation_verified=false,concurrency_verified=false;
alter table public.paymongo_test_checkouts add column creation_claimed_at timestamptz;
create table public.paymongo_test_webhook_events (
 event_id text primary key check(event_id ~ '^evt_[A-Za-z0-9]+$'),
 payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
 completed_at timestamptz not null default now()
);
alter table public.paymongo_test_webhook_events enable row level security;
alter table public.paymongo_test_webhook_events force row level security;
revoke all on public.paymongo_test_webhook_events from public,anon,authenticated,service_role;
create trigger paymongo_test_webhook_immutable before update or delete on public.paymongo_test_webhook_events for each row execute function private.guard_rental_immutable();

-- One irreversible claim BEFORE the external POST. A timeout/crash requires
-- provider-side recovery, never a second POST; no assumption of API idempotency.
create function public.claim_paymongo_test_creation(p_checkout_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare booking uuid; b public.bookings%rowtype; c public.paymongo_test_checkouts%rowtype;
begin
 if not exists(select 1 from public.paymongo_test_settings where enabled) then raise exception 'PayMongo disabled'; end if;
 select booking_id into booking from public.paymongo_test_checkouts where id=p_checkout_id;
 select * into b from public.bookings where id=booking for update;
 select * into c from public.paymongo_test_checkouts where id=p_checkout_id for update;
 if c.id is null or b.is_test is distinct from true or b.status<>'confirmed' or b.end_at<=now()
 or (b.expires_at is not null and b.expires_at<=now()) or c.checkout_deadline<=now() then raise exception 'Reservation no longer payable'; end if;
 if c.creation_claimed_at is not null or c.checkout_session_id is not null then return false; end if;
 update public.paymongo_test_checkouts set creation_claimed_at=now() where id=c.id;
 return true;
end; $$;

-- No direct service table privileges. Server authenticates owner/cron/webhook.
create function public.read_paymongo_test_checkout(p_checkout_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(c)||jsonb_build_object('reservation_active',b.is_test and b.status='confirmed'
 and b.motorcycle_unit_id=c.motorcycle_unit_id and b.start_at=c.start_at and b.end_at=c.end_at
 and round(b.quoted_total_php*100)::bigint=c.amount_centavos and b.end_at>now()
 and (b.expires_at is null or b.expires_at>now()))
 from public.paymongo_test_checkouts c join public.bookings b on b.id=c.booking_id where c.id=p_checkout_id;
$$;
create function public.list_paymongo_test_checkouts(p_after uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item order by id),'[]'::jsonb) from (
 select c.id,public.read_paymongo_test_checkout(c.id) item from public.paymongo_test_checkouts c
 where (p_after is null or c.id>p_after) and c.creation_claimed_at is not null order by c.id limit 5
 ) batch;
$$;
-- Event is marked complete only AFTER authoritative reconciliation/settlement.
-- Concurrent deliveries may both retrieve; settlement itself is atomic/idempotent.
create function public.paymongo_test_event_completed(p_event_id text,p_hash text,p_complete boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
declare previous text;
begin
 if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid event identity'; end if;
 if p_complete then insert into public.paymongo_test_webhook_events(event_id,payload_sha256) values(p_event_id,p_hash) on conflict do nothing; end if;
 select payload_sha256 into previous from public.paymongo_test_webhook_events where event_id=p_event_id;
 if found and previous<>p_hash then raise exception 'Event identity reused with different payload'; end if;
 return previous is not null;
end; $$;
revoke all on function public.claim_paymongo_test_creation(uuid),public.read_paymongo_test_checkout(uuid),public.list_paymongo_test_checkouts(uuid),public.paymongo_test_event_completed(text,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_paymongo_test_creation(uuid),public.read_paymongo_test_checkout(uuid),public.list_paymongo_test_checkouts(uuid),public.paymongo_test_event_completed(text,text,boolean) to service_role;
commit;
