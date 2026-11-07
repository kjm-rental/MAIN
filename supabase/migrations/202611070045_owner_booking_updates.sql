-- Owner-requested combined service rates, cash-only deposits and typed e-signatures.
begin;

-- Preserve existing booking snapshots. Retire the old area list for new quotes.
update public.delivery_areas set enabled=false;
insert into public.delivery_areas(name,delivery_php,collection_php,enabled) values
 ('Lapu-Lapu City Area',300,300,true),
 ('Airport to Airport',350,350,true),
 ('Mandaue Area',400,400,true),
 ('Cebu City Area',500,500,true),
 ('Cebu Port (Pier 1–5)',500,500,true);

-- Keep installed address/time validation. Allocate the combined charge across the
-- existing accounting fields: delivery first, then only any higher-area difference.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.get_delivery_quote(jsonb,timestamptz,timestamptz)'::regprocedure);
 if position('result:=result||jsonb_build_object(leg||''FeeCentavos'',fee);sum_fee:=sum_fee+fee;' in definition)=0 then
   raise exception 'Unexpected quote definition; review before applying';
 end if;
 definition:=replace(definition,
   'result:=result||jsonb_build_object(leg||''FeeCentavos'',fee);sum_fee:=sum_fee+fee;',
   'fee:=greatest(fee-sum_fee,0); result:=result||jsonb_build_object(leg||''FeeCentavos'',fee);sum_fee:=sum_fee+fee;');
 execute definition;
end;$$;

update public.security_deposit_settings set id_enabled=false,
 collection_instructions='A refundable cash security deposit is collected at pickup, separately from rental payment. You do not need to leave or surrender your original IDs.',
 return_instructions='Your refundable cash deposit is returned after the motorcycle is inspected and any agreed, documented deductions are assessed. Original IDs are not held as a deposit.',
 updated_at=clock_timestamp() where id=true;
alter table public.security_deposit_settings add constraint cash_only_deposit_policy check(not id_enabled);

create table public.booking_electronic_signatures (
 booking_id uuid primary key references public.bookings(id) on delete restrict,
 signature_name text not null check(length(trim(signature_name)) between 2 and 160),
 terms_version text not null,
 signed_at timestamptz not null default clock_timestamp(),
 method text not null default 'typed_full_name' check(method='typed_full_name')
);
alter table public.booking_electronic_signatures enable row level security;
alter table public.booking_electronic_signatures force row level security;
revoke all on public.booking_electronic_signatures from public,anon,authenticated;
grant select on public.booking_electronic_signatures to authenticated,service_role;
create policy signature_admin_read on public.booking_electronic_signatures for select to authenticated using((select private.is_active_admin()));
create trigger signature_immutable before update or delete on public.booking_electronic_signatures for each row execute function private.guard_rental_immutable();

create function public.sign_and_finalize_guest_booking_request(p_booking_id uuid,p_access_hash text,p_terms_version text,p_terms_accepted boolean,p_signature_name text)
returns table(booking_status text,verification_status text)
language plpgsql security definer set search_path='' as $$
declare existing public.booking_electronic_signatures%rowtype;
begin
 if auth.role() is distinct from 'service_role' or length(trim(coalesce(p_signature_name,''))) not between 2 and 160 then
  raise exception 'Server authorization and electronic signature required';
 end if;
 -- Serialize retries and verify ownership before reading any signature.
 perform 1 from public.bookings b join public.guest_booking_contacts g on g.booking_id=b.id
 where b.id=p_booking_id and g.access_hash=p_access_hash for update of b;
 if not found then raise exception 'Booking not found';end if;
 select * into existing from public.booking_electronic_signatures where booking_id=p_booking_id;
 if found and (existing.signature_name<>trim(p_signature_name) or existing.terms_version<>p_terms_version) then
  raise exception 'Recorded signature is immutable';
 end if;
 return query select * from public.finalize_guest_booking_request(p_booking_id,p_access_hash,p_terms_version,p_terms_accepted);
 insert into public.booking_electronic_signatures(booking_id,signature_name,terms_version)
 values(p_booking_id,trim(p_signature_name),p_terms_version) on conflict(booking_id) do nothing;
end;$$;
revoke all on function public.sign_and_finalize_guest_booking_request(uuid,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.sign_and_finalize_guest_booking_request(uuid,text,text,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
