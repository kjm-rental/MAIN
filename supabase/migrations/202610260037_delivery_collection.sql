-- PREPARED ONLY: review/apply manually after 036. No real areas/prices seeded.
begin;
alter table public.bookings add column services_total_php integer not null default 0 check(services_total_php>=0);
alter table public.bookings drop constraint bookings_total_components_check;
alter table public.bookings add constraint bookings_total_components_check check(quoted_total_php=base_total_php+extras_total_php+services_total_php);
create table public.delivery_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 delivery_open time not null default '08:00', delivery_close time not null default '17:00',
 collection_open time not null default '08:00', collection_close time not null default '17:00',
 cash_enabled boolean not null default true, qrph_enabled boolean not null default false,
 check(delivery_open<delivery_close),check(collection_open<collection_close),check(cash_enabled or qrph_enabled)
);
insert into public.delivery_settings(id) values(true);
create table public.delivery_areas (
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 2 and 120),
 delivery_php integer not null check(delivery_php between 0 and 100000), collection_php integer not null check(collection_php between 0 and 100000),
 enabled boolean not null default false
);
create table public.booking_services (
 booking_id uuid primary key references public.bookings(id) on delete restrict,
 delivery_area_id uuid references public.delivery_areas(id) on delete restrict,
 collection_area_id uuid references public.delivery_areas(id) on delete restrict,
 delivery jsonb,collection jsonb,
 delivery_fee_centavos integer not null check(delivery_fee_centavos>=0),collection_fee_centavos integer not null check(collection_fee_centavos>=0),
 payment_method text not null check(payment_method in ('cash','qrph')),
 created_at timestamptz not null default now()
);
create trigger booking_services_immutable before update or delete on public.booking_services for each row execute function private.guard_rental_immutable();
alter table public.delivery_settings enable row level security;alter table public.delivery_settings force row level security;
alter table public.delivery_areas enable row level security;alter table public.delivery_areas force row level security;
alter table public.booking_services enable row level security;alter table public.booking_services force row level security;
revoke all on public.delivery_settings,public.delivery_areas,public.booking_services from public,anon,authenticated;
grant select on public.delivery_settings,public.delivery_areas,public.booking_services to authenticated,service_role;
create policy delivery_settings_admin on public.delivery_settings for select to authenticated using((select private.is_active_admin()));
create policy delivery_areas_admin on public.delivery_areas for select to authenticated using((select private.is_active_admin()));
create policy booking_services_admin on public.booking_services for select to authenticated using((select private.is_active_admin()));
create function private.delivery_qrph_ready() returns boolean language plpgsql stable security definer set search_path='' as $$
declare ready boolean:=false;begin
 if to_regprocedure('public.paymongo_live_ready()') is null then return false;end if;
 execute 'select public.paymongo_live_ready()' into ready;return coalesce(ready,false);
end;$$;
revoke all on function private.delivery_qrph_ready() from public,anon,authenticated,service_role;
create function public.get_delivery_options() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',s.enabled,'delivery_open',s.delivery_open,'delivery_close',s.delivery_close,'collection_open',s.collection_open,'collection_close',s.collection_close,'cash_enabled',s.cash_enabled,'qrph_enabled',s.qrph_enabled,'qrph_ready',private.delivery_qrph_ready(),
 'areas',case when s.enabled then coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'delivery_php',a.delivery_php,'collection_php',a.collection_php) order by a.name) from public.delivery_areas a where a.enabled),'[]'::jsonb) else '[]'::jsonb end)
 from public.delivery_settings s where id;
$$;
revoke all on function public.get_delivery_options() from public;grant execute on function public.get_delivery_options() to anon,authenticated,service_role;
create function public.admin_save_delivery_settings(p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_admin() then raise exception 'Administrator access required';end if;
 if (p_values->>'qrph_enabled')::boolean and not private.delivery_qrph_ready() then raise exception 'Live QRPh verification is required';end if;
 update public.delivery_settings set enabled=(p_values->>'enabled')::boolean,delivery_open=(p_values->>'delivery_open')::time,delivery_close=(p_values->>'delivery_close')::time,collection_open=(p_values->>'collection_open')::time,collection_close=(p_values->>'collection_close')::time,cash_enabled=(p_values->>'cash_enabled')::boolean,qrph_enabled=(p_values->>'qrph_enabled')::boolean where id;
 insert into public.audit_logs(actor_user_id,action,entity_type,metadata) values(auth.uid(),'delivery.settings_updated','delivery_settings',p_values);
end;$$;
create function public.admin_save_delivery_area(p_id uuid,p_values jsonb,p_remove boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_admin() then raise exception 'Administrator access required';end if;
 if p_remove then delete from public.delivery_areas where id=p_id;
 elsif p_id is null then insert into public.delivery_areas(name,delivery_php,collection_php,enabled) values(trim(p_values->>'name'),(p_values->>'delivery_php')::integer,(p_values->>'collection_php')::integer,(p_values->>'enabled')::boolean);
 else update public.delivery_areas set name=trim(p_values->>'name'),delivery_php=(p_values->>'delivery_php')::integer,collection_php=(p_values->>'collection_php')::integer,enabled=(p_values->>'enabled')::boolean where id=p_id;end if;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),case when p_remove then 'delivery.area_removed' else 'delivery.area_saved' end,'delivery_area',p_id);
end;$$;
revoke all on function public.admin_save_delivery_settings(jsonb),public.admin_save_delivery_area(uuid,jsonb,boolean) from public,anon;
grant execute on function public.admin_save_delivery_settings(jsonb),public.admin_save_delivery_area(uuid,jsonb,boolean) to authenticated;
create function public.get_delivery_quote(p_selection jsonb,p_start timestamptz,p_end timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.delivery_settings%rowtype;a public.delivery_areas%rowtype; leg text;detail jsonb;result jsonb:='{}';fee integer;sum_fee integer:=0;when_at timestamptz;opens time;closes time;
begin
 select * into s from public.delivery_settings where id for share;
 foreach leg in array array['delivery','collection'] loop
  detail:=p_selection->leg;fee:=0;
  if detail is not null and detail<>'null'::jsonb then
   if not s.enabled then raise exception 'Delivery and collection are unavailable';end if;
   select * into a from public.delivery_areas where id=(detail->>'areaId')::uuid and enabled for share;
   if a.id is null or length(trim(coalesce(detail->>'address',''))) not between 5 and 500 or octet_length(detail::text)>6000 then raise exception 'Select an available area and full address';end if;
   when_at:=case leg when 'delivery' then p_start else p_end end;
   opens:=case leg when 'delivery' then s.delivery_open else s.collection_open end;closes:=case leg when 'delivery' then s.delivery_close else s.collection_close end;
   if when_at is null or (when_at at time zone 'Asia/Manila')::time<opens or (when_at at time zone 'Asia/Manila')::time>closes then raise exception 'Selected service time is outside service operating hours';end if;
   fee:=case leg when 'delivery' then a.delivery_php else a.collection_php end*100;
   result:=result||jsonb_build_object(leg,detail||jsonb_build_object('areaName',a.name,'scheduledAt',when_at));
  end if;
  result:=result||jsonb_build_object(leg||'FeeCentavos',fee);sum_fee:=sum_fee+fee;
 end loop;
 return result||jsonb_build_object('totalCentavos',sum_fee);
end;$$;
revoke all on function public.get_delivery_quote(jsonb,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.get_delivery_quote(jsonb,timestamptz,timestamptz) to service_role;
alter function public.submit_guest_booking_request(jsonb,text) rename to submit_guest_booking_request_core;
revoke all on function public.submit_guest_booking_request_core(jsonb,text) from public,anon,authenticated,service_role;
create function public.submit_guest_booking_request(p_payload jsonb,p_access_hash text)
returns table(booking_id uuid,booking_reference text,verification_id uuid,rental_total_centavos integer,deposit_required_centavos integer,cash_due_at_pickup_centavos bigint)
language plpgsql security definer set search_path='' as $$
declare q jsonb;made record;method text:=coalesce(p_payload->>'p_payment_method','cash');s public.delivery_settings%rowtype;new_total integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server authorization required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_payload->>'p_idempotency_key',35));
 if not exists(select 1 from public.bookings where idempotency_key=(p_payload->>'p_idempotency_key')::uuid) then
  select * into s from public.delivery_settings where id for share;
  if method not in ('cash','qrph') or (method='cash' and not s.cash_enabled) or (method='qrph' and (not s.qrph_enabled or not private.delivery_qrph_ready())) then raise exception 'Selected payment method unavailable';end if;
  if p_payload->>'p_deposit_option' is distinct from 'cash' then raise exception 'Refundable security deposit must be collected separately in cash';end if;
  q:=public.get_delivery_quote(coalesce(p_payload->'p_services','{}'),(p_payload->>'p_start_at')::timestamptz,(p_payload->>'p_end_at')::timestamptz);
  if (q->>'totalCentavos')::integer is distinct from coalesce((p_payload->>'p_expected_service_centavos')::integer,0) or (q->>'deliveryFeeCentavos')::integer is distinct from coalesce((p_payload->>'p_expected_delivery_centavos')::integer,0) or (q->>'collectionFeeCentavos')::integer is distinct from coalesce((p_payload->>'p_expected_collection_centavos')::integer,0) then raise exception 'Service price changed; request a fresh quote';end if;
 end if;
 select * into made from public.submit_guest_booking_request_core(p_payload,p_access_hash);
 if q is null then return query select made.booking_id,made.booking_reference,made.verification_id,made.rental_total_centavos,made.deposit_required_centavos,made.cash_due_at_pickup_centavos;return;end if;
 if not exists(select 1 from public.booking_services where booking_services.booking_id=made.booking_id) then
  insert into public.booking_services(booking_id,delivery_area_id,collection_area_id,delivery,collection,delivery_fee_centavos,collection_fee_centavos,payment_method)
  values(made.booking_id,(p_payload->'p_services'->'delivery'->>'areaId')::uuid,(p_payload->'p_services'->'collection'->>'areaId')::uuid,q->'delivery',q->'collection',(q->>'deliveryFeeCentavos')::integer,(q->>'collectionFeeCentavos')::integer,method);
  update public.bookings set quoted_total_php=quoted_total_php+(q->>'totalCentavos')::integer/100,services_total_php=(q->>'totalCentavos')::integer/100 where id=made.booking_id returning total_centavos into new_total;
 else select total_centavos into new_total from public.bookings where id=made.booking_id;end if;
 return query select made.booking_id,made.booking_reference,made.verification_id,new_total,made.deposit_required_centavos,new_total::bigint+made.deposit_required_centavos;
end;$$;
revoke all on function public.submit_guest_booking_request(jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_guest_booking_request(jsonb,text) to service_role;
-- Keep saved services unchanged during reschedule; require explicit owner review of a new service schedule.
create function private.guard_service_reschedule() returns trigger language plpgsql set search_path='' as $$
begin if (new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at) and exists(select 1 from public.booking_services s where s.booking_id=old.id and (s.delivery is not null or s.collection is not null)) then raise exception 'Delivery/collection booking reschedule requires service review; contact owner';end if;return new;end;$$;
create trigger service_reschedule_guard before update of start_at,end_at on public.bookings for each row execute function private.guard_service_reschedule();
-- Enrich the EXISTING outbox; no transport settings or historical payloads changed.
create function private.notification_delivery_details() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.booking_services%rowtype;paid bigint;
begin
 select * into s from public.booking_services where booking_id=new.booking_id;
 if s.booking_id is not null then
  select coalesce(sum(case when event_type='payment' then amount_centavos else -amount_centavos end),0) into paid from public.payment_events where booking_id=new.booking_id;
  new.payload:=new.payload||jsonb_build_object('delivery',s.delivery,'collection',s.collection,'deliveryFeeCentavos',s.delivery_fee_centavos,'collectionFeeCentavos',s.collection_fee_centavos,'paymentMethod',s.payment_method,'paymentStatus',case when paid>=(select total_centavos from public.bookings where id=new.booking_id) then 'paid' else 'unpaid' end);
 end if;return new;
end;$$;
create trigger notification_delivery_details before insert on public.notification_outbox for each row execute function private.notification_delivery_details();
commit;
