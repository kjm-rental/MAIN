-- PREPARED ONLY. Review/apply manually after live foundation 026 and guest checkout 038.
-- Optional reconciliation visibility; never edits a booking price or financial event.
begin;
alter table public.paymongo_live_checkouts
 add column provider_status text check(provider_status in ('pending','failed_unpaid','cancelled_unpaid','expired_unpaid','paid','review_required')),
 add column provider_checked_at timestamptz;
create function public.note_paymongo_provider_status(p_checkout_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.paymongo_live_checkouts%rowtype; result text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server authorization required';end if;
 if p_status is null or p_status not in ('pending','failed_unpaid','cancelled_unpaid','expired_unpaid','paid','review_required') then raise exception 'Invalid provider state';end if;
 select * into c from public.paymongo_live_checkouts where id=p_checkout_id for update;
 if c.id is null then raise exception 'Checkout unavailable';end if;
 result:=case when c.status in ('paid','review_required') then c.status else p_status end;
 if result in ('paid','review_required') and not exists(select 1 from public.paymongo_live_receipts where checkout_id=c.id and livemode) then raise exception 'Verified receipt required';end if;
 update public.paymongo_live_checkouts set provider_status=result,provider_checked_at=now() where id=c.id;
 if c.provider_status is distinct from result then
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(null,'paymongo.provider_status_verified','booking',c.booking_id,jsonb_build_object('checkout_id',c.id,'provider_status',result));
 end if;
end;$$;
revoke all on function public.note_paymongo_provider_status(uuid,text) from public,anon,authenticated;
grant execute on function public.note_paymongo_provider_status(uuid,text) to service_role;
commit;
