begin;
-- Reuse the compatibility setting managed by ADMIN; no model readiness is invented.
alter table public.booking_extras_catalog add column if not exists compatible_model_ids uuid[] not null default '{}';

alter table public.booking_extras_catalog add column if not exists compatible_unit_ids uuid[] not null default '{}';

create function private.accessory_unit_available(p_unit uuid,p_start timestamptz,p_end timestamptz,p_exclude uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.motorcycle_units u where u.id=p_unit and u.status='available' and u.archived_at is null
 and not exists(select 1 from public.bookings b where b.motorcycle_unit_id=u.id and b.id is distinct from p_exclude and b.status in ('submitted','pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(p_start,p_end,'[)'))
 and not exists(select 1 from public.booking_inventory_holds h where h.motorcycle_unit_id=u.id and h.booking_id is distinct from p_exclude and h.released_at is null and h.converted_at is null and h.expires_at>now() and tstzrange(h.start_at,h.end_at,'[)')&&tstzrange(p_start,p_end,'[)'))
 and not exists(select 1 from public.motorcycle_unavailability x where x.motorcycle_unit_id=u.id and tstzrange(x.start_at,x.end_at,'[)')&&tstzrange(p_start,p_end,'[)')));
$$;
revoke all on function private.accessory_unit_available(uuid,timestamptz,timestamptz,uuid) from public,anon,authenticated,service_role;

create function public.get_available_booking_accessories(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_selected_color text default null)
returns table(id uuid) language sql stable security definer set search_path='' as $$
 select e.id from public.booking_extras_catalog e where e.is_active and e.is_available
 and p_end_at>p_start_at and p_start_at>now()
 and (e.name !~* '(top|back)[ _-]*box' or cardinality(e.compatible_unit_ids)>0)
 and (cardinality(e.compatible_model_ids)=0 or p_model_id=any(e.compatible_model_ids))
 and (cardinality(e.compatible_unit_ids)=0 or exists(select 1 from public.motorcycle_units u where u.motorcycle_model_id=p_model_id and u.id=any(e.compatible_unit_ids) and (p_selected_color is null or lower(btrim(to_jsonb(u)->>'color'))=lower(btrim(p_selected_color))) and private.accessory_unit_available(u.id,p_start_at,p_end_at)));
$$;
revoke all on function public.get_available_booking_accessories(uuid,timestamptz,timestamptz,text) from public;
grant execute on function public.get_available_booking_accessories(uuid,timestamptz,timestamptz,text) to anon,authenticated;

create or replace function private.validate_motorcycle_extras(p_model_id uuid,p_items jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; extra public.booking_extras_catalog%rowtype; quantity integer;
begin
 if p_items is null then return; end if;
 if jsonb_typeof(p_items)<>'array' then raise exception 'Invalid extras selection'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  select * into extra from public.booking_extras_catalog where id=(item->>'id')::uuid;
  if extra.id is null then raise exception 'Selected accessory is unavailable'; end if;
  quantity:=(item->>'quantity')::integer;
  if quantity is null or quantity<1 or quantity>extra.max_per_booking
    or (extra.name ~* '^\s*(helmets?|raincoats?)\s*$' and quantity>2)
    or (extra.name ~* '(top|back)[ _-]*box' and quantity>1)
  then raise exception 'Selected accessory quantity exceeds its booking limit'; end if;
  if (extra.name ~* '(top|back)[ _-]*box' and cardinality(extra.compatible_unit_ids)=0)
    or (cardinality(extra.compatible_model_ids)>0 and (p_model_id is null or not (p_model_id=any(extra.compatible_model_ids))))
  then raise exception 'Selected accessory is not configured as compatible with this motorcycle'; end if;
 end loop;
end; $$;
revoke all on function private.validate_motorcycle_extras(uuid,jsonb) from public,anon,authenticated,service_role;

-- All customer quote versions and submissions delegate to V2.
create or replace function public.get_booking_quote_v2(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_extra_items jsonb default '[]')
returns table(pricing_units integer,daily_rate_php integer,base_total_centavos integer,extras_total_centavos integer,fees_total_centavos integer,deposit_required_centavos integer,total_centavos integer)
language plpgsql volatile security definer set search_path='' as $$
declare q record; extras_php integer;
begin
 perform private.validate_motorcycle_extras(p_model_id,p_extra_items);
 select * into q from private.calculate_booking_quote(p_model_id,p_start_at,p_end_at,true);
 select coalesce(sum(x.line_total_php),0)::integer into extras_php from private.calculate_extra_selection(p_extra_items,p_start_at,p_end_at,q.pricing_units,false) x;
 return query select q.pricing_units,q.daily_rate_php,q.total_php*100,extras_php*100,0,null::integer,(q.total_php+extras_php)*100;
end; $$;

-- Enforce against direct line insertion and manual bookings as well.
create or replace function private.validate_booking_accessory_line()
returns trigger language plpgsql security definer set search_path='' as $$
declare model uuid;
begin
 if new.extra_id is null then return new; end if;
 select motorcycle_model_id into model from public.bookings where id=new.booking_id;
 perform private.validate_motorcycle_extras(model,jsonb_build_array(jsonb_build_object('id',new.extra_id,'quantity',new.quantity)));
 return new;
end; $$;
revoke all on function private.validate_booking_accessory_line() from public,anon,authenticated,service_role;
create trigger booking_accessory_compatibility before insert or update of extra_id,quantity,booking_id on public.booking_extra_items for each row execute function private.validate_booking_accessory_line();

-- A line may be added before or after the initial hold. Align an existing hold
-- to the intersection of selected accessories; never switch an assigned unit.
create function private.align_accessory_unit() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; h public.booking_inventory_holds%rowtype; candidate uuid; current_unit uuid;
begin
 select * into b from public.bookings where id=new.booking_id for update;
 if not exists(select 1 from public.booking_extra_items l join public.booking_extras_catalog e on e.id=l.extra_id where l.booking_id=b.id and cardinality(e.compatible_unit_ids)>0) then return new; end if;
 select * into h from public.booking_inventory_holds where booking_id=b.id and released_at is null and converted_at is null and expires_at>now() for update;
 current_unit:=coalesce(b.motorcycle_unit_id,h.motorcycle_unit_id);
 if current_unit is null then return new; end if;
 if not exists(select 1 from public.booking_extra_items l join public.booking_extras_catalog e on e.id=l.extra_id where l.booking_id=b.id and cardinality(e.compatible_unit_ids)>0 and not(current_unit=any(e.compatible_unit_ids))) then return new; end if;
 if b.motorcycle_unit_id is not null then raise exception 'Assigned motorcycle unit is not ready for selected accessories'; end if;
 select u.id into candidate from public.motorcycle_units u where u.motorcycle_model_id=b.motorcycle_model_id
 and (to_jsonb(b)->>'selected_color' is null or lower(btrim(to_jsonb(u)->>'color'))=lower(btrim(to_jsonb(b)->>'selected_color')))
 and private.accessory_unit_available(u.id,b.start_at,b.end_at,b.id)
 and not exists(select 1 from public.booking_extra_items l join public.booking_extras_catalog e on e.id=l.extra_id where l.booking_id=b.id and cardinality(e.compatible_unit_ids)>0 and not(u.id=any(e.compatible_unit_ids)))
 order by u.internal_unit_code for update of u skip locked limit 1;
 if candidate is null then raise exception 'No installation-ready unit is available for the selected accessories and dates'; end if;
 update public.booking_inventory_holds set motorcycle_unit_id=candidate where id=h.id;
 return new;
end; $$;
revoke all on function private.align_accessory_unit() from public,anon,authenticated,service_role;
create trigger align_booking_accessory_unit after insert or update of extra_id,quantity,booking_id on public.booking_extra_items for each row execute function private.align_accessory_unit();

-- Guest bookings insert accessories before their hold. Select a compatible unit
-- when that hold is created, using the same availability locks as checkout.
create function private.hold_accessory_unit() returns trigger
language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype; candidate uuid;
begin
 select * into b from public.bookings where id=new.booking_id;
 if not exists(select 1 from public.booking_extra_items l join public.booking_extras_catalog e on e.id=l.extra_id where l.booking_id=b.id and cardinality(e.compatible_unit_ids)>0 and not(new.motorcycle_unit_id=any(e.compatible_unit_ids))) then return new; end if;
 select u.id into candidate from public.motorcycle_units u where u.motorcycle_model_id=b.motorcycle_model_id
 and (to_jsonb(b)->>'selected_color' is null or lower(btrim(to_jsonb(u)->>'color'))=lower(btrim(to_jsonb(b)->>'selected_color')))
 and private.accessory_unit_available(u.id,new.start_at,new.end_at,b.id)
 and not exists(select 1 from public.booking_extra_items l join public.booking_extras_catalog e on e.id=l.extra_id where l.booking_id=b.id and cardinality(e.compatible_unit_ids)>0 and not(u.id=any(e.compatible_unit_ids)))
 order by u.internal_unit_code for update of u skip locked limit 1;
 if candidate is null then raise exception 'No installation-ready unit is available for the selected accessories and dates'; end if;
 new.motorcycle_unit_id:=candidate; return new;
end; $$;
revoke all on function private.hold_accessory_unit() from public,anon,authenticated,service_role;
create trigger hold_booking_accessory_unit before insert or update of motorcycle_unit_id on public.booking_inventory_holds for each row execute function private.hold_accessory_unit();

-- Reject incompatible reassignment even when it originates in administrative tooling.
create function private.guard_assigned_accessory_unit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.motorcycle_unit_id is not null and exists(select 1 from public.booking_extra_items l join public.booking_extras_catalog e on e.id=l.extra_id where l.booking_id=new.id and cardinality(e.compatible_unit_ids)>0 and not(new.motorcycle_unit_id=any(e.compatible_unit_ids))) then raise exception 'Assigned motorcycle unit is not ready for selected accessories'; end if;
 return new;
end; $$;
revoke all on function private.guard_assigned_accessory_unit() from public,anon,authenticated,service_role;
create trigger guard_assigned_accessory_unit before update of motorcycle_unit_id on public.bookings for each row execute function private.guard_assigned_accessory_unit();
commit;
