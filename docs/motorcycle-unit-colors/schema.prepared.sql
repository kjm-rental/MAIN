-- OWNER REVIEW ONLY — DO NOT EXECUTE AUTOMATICALLY.
-- Schema foundation, not feature activation. Application/RPC integration and
-- focused verification must follow review before this feature is operational.
-- Canonical schema owner: KJM MAIN; KJM ADMIN uses the same database.
begin;

-- Serialize the duplicate preflight and index creation with inventory writes.
lock table public.motorcycle_units in share row exclusive mode;

-- Reuse registration_plate. Do not rewrite any existing plate or resolve
-- historical collisions automatically. Include archived units in uniqueness.
do $$
begin
  if exists (
    select 1 from public.motorcycle_units
    where nullif(btrim(registration_plate), '') is not null
    group by upper(btrim(registration_plate))
    having count(*) > 1
  ) then
    raise exception 'Duplicate license plates after trimming and uppercasing. Owner must review existing records before applying this migration.';
  end if;
end;
$$;

create unique index motorcycle_units_normalized_plate_unique
on public.motorcycle_units (upper(btrim(registration_plate)))
where nullif(btrim(registration_plate), '') is not null;

-- Nullable for historical/quantity-created units. No defaults or backfill.
alter table public.motorcycle_units add column color text
  constraint motorcycle_units_color_valid
  check (color is null or (length(btrim(color)) between 1 and 100));

-- Explicit booking snapshot; never derive historical selections from a unit.
alter table public.bookings add column selected_color text
  constraint bookings_selected_color_valid
  check (selected_color is null or (length(btrim(selected_color)) between 1 and 100));

comment on column public.motorcycle_units.color is
  'Owner-configured unit color. Nullable for legacy inventory; normalize on explicit create/edit only.';
comment on column public.bookings.selected_color is
  'Customer-selected color snapshot. Nullable for legacy bookings; future assignment must enforce matching color without rewriting this snapshot.';

-- Existing table privileges and RLS remain unchanged. No public unit grants.
-- No units/models/bookings are inserted, updated, deleted, or reassigned.
commit;
