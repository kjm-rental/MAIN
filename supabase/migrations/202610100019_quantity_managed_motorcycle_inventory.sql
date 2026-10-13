-- Keep physical identities; quantity reductions archive only uncommitted units.
create or replace function public.admin_set_motorcycle_quantity(p_model_id uuid,p_total integer,p_expected_total integer)
returns void language plpgsql security definer set search_path='' as $$
declare current_total integer; remove_count integer; candidates uuid[]; unit_id uuid;
begin
  if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
  if p_total is null or p_total<0 or p_total>1000 or p_expected_total is null then raise exception 'Quantity must be between 0 and 1000'; end if;
  -- The same model lock used by submission, followed by table write locks,
  -- serializes quantity changes with submissions, confirmations and reschedules.
  perform pg_advisory_xact_lock(hashtextextended(p_model_id::text,0));
  -- Fail fast instead of waiting on another model's submission, which may
  -- already hold a holds-table write lock and later need the bookings table.
  lock table public.bookings in share row exclusive mode nowait;
  lock table public.booking_inventory_holds in share row exclusive mode nowait;
  lock table public.motorcycle_units in share row exclusive mode nowait;
  lock table public.motorcycle_unavailability in share row exclusive mode nowait;
  if not exists(select 1 from public.motorcycle_models where id=p_model_id and archived_at is null) then raise exception 'Motorcycle model not found'; end if;
  select count(*)::integer into current_total from public.motorcycle_units where motorcycle_model_id=p_model_id and archived_at is null;
  if current_total<>p_expected_total then raise exception 'Inventory changed. Refresh before saving again'; end if;
  if p_total>current_total then
    for i in 1..(p_total-current_total) loop
      unit_id:=gen_random_uuid();
      insert into public.motorcycle_units(id,motorcycle_model_id,internal_unit_code,registration_plate,status)
      values(unit_id,p_model_id,'KJM-'||unit_id::text,null,'available');
    end loop;
  elsif p_total<current_total then
    -- Requests without an assigned unit or live hold still represent demand.
    if exists(select 1 from public.bookings b where b.motorcycle_model_id=p_model_id and b.status in ('submitted','pending') and b.motorcycle_unit_id is null
      and not exists(select 1 from public.booking_inventory_holds h where h.booking_id=b.id and h.released_at is null and h.converted_at is null and h.expires_at>now())) then
      raise exception 'Resolve pending requests without inventory holds before reducing quantity';
    end if;
    remove_count:=current_total-p_total;
    select array_agg(id) into candidates from (
      select u.id from public.motorcycle_units u where u.motorcycle_model_id=p_model_id and u.archived_at is null
      and u.status not in ('reserved','rented')
      and not exists(select 1 from public.bookings b where b.motorcycle_unit_id=u.id and b.status in ('submitted','pending','confirmed','active'))
      and not exists(select 1 from public.booking_inventory_holds h where h.motorcycle_unit_id=u.id and h.released_at is null and h.converted_at is null and h.expires_at>now())
      and not exists(select 1 from public.motorcycle_unavailability x where x.motorcycle_unit_id=u.id and x.end_at>now())
      order by u.created_at desc,u.id limit remove_count for update of u
    ) available;
    if coalesce(cardinality(candidates),0)<>remove_count then raise exception 'Quantity cannot be reduced below reserved, rented, held or blocked inventory'; end if;
    update public.motorcycle_units set archived_at=now(),status='inactive' where id=any(candidates);
  end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'inventory.quantity_changed','motorcycle_model',p_model_id,jsonb_build_object('old_total',current_total,'new_total',p_total));
exception when lock_not_available then
  raise exception 'Inventory is busy with another booking operation. Please retry' using errcode='55P03';
end; $$;
revoke all on function public.admin_set_motorcycle_quantity(uuid,integer,integer) from public,anon;
grant execute on function public.admin_set_motorcycle_quantity(uuid,integer,integer) to authenticated;
