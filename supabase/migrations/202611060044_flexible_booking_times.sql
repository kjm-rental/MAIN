-- Exact minute bookings, 24/7 defaults and operator-managed endpoint closures.
-- No existing bookings, payment values or pricing policies are changed.
begin;

create table public.booking_time_blocks (
  id uuid primary key default gen_random_uuid(),
  start_at timestamptz not null,
  end_at timestamptz not null,
  scope text not null check(scope in ('pickup','return','both')),
  reason text not null default '' check(length(reason)<=500),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  check(end_at>start_at)
);
create index booking_time_blocks_active_period on public.booking_time_blocks(start_at,end_at) where cancelled_at is null;
alter table public.booking_time_blocks enable row level security;
alter table public.booking_time_blocks force row level security;
revoke all on public.booking_time_blocks from public,anon,authenticated,service_role;
grant select on public.booking_time_blocks to authenticated;
create policy booking_time_blocks_admin_read on public.booking_time_blocks for select to authenticated using(private.is_active_admin());

-- Public response deliberately excludes operator notes and administrator identities.
create function public.get_booking_time_blocks(p_from timestamptz,p_to timestamptz)
returns table(start_at timestamptz,end_at timestamptz,scope text)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '93 days' then
    raise exception 'Choose a time-block window of up to 93 days';
  end if;
  return query select b.start_at,b.end_at,b.scope from public.booking_time_blocks b
    where b.cancelled_at is null and b.end_at>p_from and b.start_at<p_to order by b.start_at;
end;$$;
revoke all on function public.get_booking_time_blocks(timestamptz,timestamptz) from public;
grant execute on function public.get_booking_time_blocks(timestamptz,timestamptz) to anon,authenticated,service_role;

create function private.assert_booking_time_blocks(p_start_at timestamptz,p_end_at timestamptz)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  if exists(select 1 from public.booking_time_blocks b where b.cancelled_at is null
    and b.scope in ('pickup','both') and p_start_at>=b.start_at and p_start_at<b.end_at) then
    raise exception 'Pickup time is unavailable. Please choose another time.' using errcode='P0001';
  end if;
  if exists(select 1 from public.booking_time_blocks b where b.cancelled_at is null
    and b.scope in ('return','both') and p_end_at>=b.start_at and p_end_at<b.end_at) then
    raise exception 'Return time is unavailable. Please choose another time.' using errcode='P0001';
  end if;
end;$$;
revoke all on function private.assert_booking_time_blocks(timestamptz,timestamptz) from public,anon,authenticated,service_role;

-- Existing quote/submission/manual booking paths share this operating-hours guard.
-- Preserve its installed logic; add the endpoint closure check only.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('private.assert_booking_period_allowed(timestamptz,timestamptz,jsonb)'::regprocedure);
  if position('if p_end_at <= p_start_at then' in definition)=0 then
    raise exception 'Unexpected booking-period validator; review before applying';
  end if;
  definition:=replace(definition,'if p_end_at <= p_start_at then',
    'perform private.assert_booking_time_blocks(p_start_at,p_end_at);' || chr(10) || '  if p_end_at <= p_start_at then');
  -- Use a fresh snapshot when checking an administrator closure.
  definition:=replace(definition,'STABLE','VOLATILE');
  execute definition;
end;$$;

-- Final database write guard: queued/in-flight requests cannot bypass closures.
create function private.guard_booking_time_blocks() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    if new.start_at is not distinct from old.start_at and new.end_at is not distinct from old.end_at then return new; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(20261106,44);
  perform private.assert_booking_time_blocks(new.start_at,new.end_at);
  return new;
end;$$;
revoke all on function private.guard_booking_time_blocks() from public,anon,authenticated,service_role;
create trigger booking_time_blocks_guard before insert or update of start_at,end_at on public.bookings
for each row execute function private.guard_booking_time_blocks();

create function public.admin_add_booking_time_block(p_start_at timestamptz,p_end_at timestamptz,p_scope text,p_reason text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if auth.uid() is null or not private.is_active_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_start_at is null or p_end_at is null or p_end_at<=p_start_at or p_end_at<=now()
    or p_scope is null or p_scope not in ('pickup','return','both') or length(coalesce(p_reason,''))>500 then
    raise exception 'Choose valid future unavailable times';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(20261106,44);
  insert into public.booking_time_blocks(start_at,end_at,scope,reason,created_by)
    values(p_start_at,p_end_at,p_scope,btrim(coalesce(p_reason,'')),auth.uid()) returning id into result;
  insert into public.audit_logs(actor_user_id,action,entity_type,metadata)
    values(auth.uid(),'booking.time_block_added','booking_time_blocks',jsonb_build_object('id',result,'start_at',p_start_at,'end_at',p_end_at,'scope',p_scope));
  return result;
end;$$;
create function public.admin_cancel_booking_time_block(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.is_active_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(20261106,44);
  update public.booking_time_blocks set cancelled_at=now(),cancelled_by=auth.uid() where id=p_id and cancelled_at is null;
  if not found then raise exception 'This time block is no longer active'; end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,metadata)
    values(auth.uid(),'booking.time_block_removed','booking_time_blocks',jsonb_build_object('id',p_id));
end;$$;
revoke all on function public.admin_add_booking_time_block(timestamptz,timestamptz,text,text),public.admin_cancel_booking_time_block(uuid) from public,anon,service_role;
grant execute on function public.admin_add_booking_time_block(timestamptz,timestamptz,text,text),public.admin_cancel_booking_time_block(uuid) to authenticated;

-- 00:00 -> 00:00 means all day, matching the booking-hours validator.
do $$
declare item record; definition text; needle text;
begin
  for item in select conname from pg_constraint where conrelid='public.delivery_settings'::regclass and contype='c'
    and (pg_get_constraintdef(oid) like '%delivery_open%delivery_close%' or pg_get_constraintdef(oid) like '%collection_open%collection_close%')
  loop execute format('alter table public.delivery_settings drop constraint %I',item.conname); end loop;
  definition:=pg_get_functiondef('public.get_delivery_quote(jsonb,timestamptz,timestamptz)'::regprocedure);
  needle:='if when_at is null or (when_at at time zone ''Asia/Manila'')::time<opens or (when_at at time zone ''Asia/Manila'')::time>closes then';
  if position(needle in definition)=0 then raise exception 'Unexpected delivery-hours validator; review before applying'; end if;
  definition:=replace(definition,needle,
    'perform private.assert_booking_time_blocks(p_start,p_end);' || chr(10) ||
    '   if when_at is null or (not (opens=time ''00:00'' and closes=time ''00:00'') and ((when_at at time zone ''Asia/Manila'')::time<opens or (when_at at time zone ''Asia/Manila'')::time>closes)) then');
  execute definition;
end;$$;
alter table public.delivery_settings add constraint delivery_hours_window check(delivery_open<delivery_close or (delivery_open=time '00:00' and delivery_close=time '00:00'));
alter table public.delivery_settings add constraint collection_hours_window check(collection_open<collection_close or (collection_open=time '00:00' and collection_close=time '00:00'));

create function public.admin_enable_24_hour_booking() returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.is_active_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  update public.booking_settings set operating_hours=(select jsonb_object_agg(day,
    jsonb_build_object('enabled',true,'pickupOpen','00:00','pickupClose','00:00','returnOpen','00:00','returnClose','00:00'))
    from unnest(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) day),updated_at=now() where id=true;
  update public.delivery_settings set delivery_open='00:00',delivery_close='00:00',collection_open='00:00',collection_close='00:00' where id=true;
  insert into public.audit_logs(actor_user_id,action,entity_type,metadata)
    values(auth.uid(),'booking.24_hour_availability_enabled','booking_settings','{"time_blocks_preserved":true}'::jsonb);
end;$$;
revoke all on function public.admin_enable_24_hour_booking() from public,anon,service_role;
grant execute on function public.admin_enable_24_hour_booking() to authenticated;

-- Owner requested 24/7 operation, including late-night delivery and collection.
-- Keep the booking master switch, service enablement, fees and payment methods as configured.
update public.booking_settings set operating_hours=(select jsonb_object_agg(day,
  jsonb_build_object('enabled',true,'pickupOpen','00:00','pickupClose','00:00','returnOpen','00:00','returnClose','00:00'))
  from unnest(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) day),updated_at=now() where id=true;
update public.delivery_settings set delivery_open='00:00',delivery_close='00:00',collection_open='00:00',collection_close='00:00' where id=true;
notify pgrst,'reload schema';
commit;
