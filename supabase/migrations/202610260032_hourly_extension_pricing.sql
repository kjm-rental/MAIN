-- REVIEW REQUIRED. Do not apply automatically. No policy is selected by this migration.
-- Existing bookings and daily/weekly/monthly prices are not updated.
begin;
alter table public.motorcycle_models add column hourly_extension_rate_php integer check(hourly_extension_rate_php > 0);
alter table public.booking_settings add column max_hourly_extension_hours integer check(max_hourly_extension_hours between 0 and 23);
alter table public.bookings add column rental_pricing jsonb;
alter table public.booking_settings add constraint hourly_policy_requires_24h check(max_hourly_extension_hours is null or partial_day_policy='started_24_hours');
comment on column public.booking_settings.max_hourly_extension_hours is 'NULL preserves legacy billing; explicit 0 bills complete periods; 1–23 permits rounded-up extension hours up to this limit, capped at next complete package price.';

-- Exact IDs and public names were read from the existing catalog, 2026-10-26.
-- No INSERT, duplicate creation, fuzzy matching or alteration of other rates.
-- Aerox 160cc intentionally omitted: owner asked to review the Aerox 155 mismatch.
-- Honda Beat omitted: no active existing record. Configure only after an exact match exists.
update public.motorcycle_models m set hourly_extension_rate_php = seed.rate
from (values
 ('cf24bed9-0ab3-45b8-a107-cd6ce59ac7fd'::uuid,'Honda Click 125cc',60),
 ('64720cfd-e3a1-4223-98d1-bcbc9a3fb3ae'::uuid,'Honda Click 160cc',70),
 ('69ea75b7-0a6e-4931-94c8-2762a64b5d21'::uuid,'Honda PCX 160cc',80),
 ('fcf80dc3-425f-4e9f-9ede-a6b3c93d0680'::uuid,'Honda ADV 160',100),
 ('be131d5a-e672-423c-8455-e9dbfd79168a'::uuid,'Honda ADV 350',250),
 ('183e8f6d-5a40-423b-b7e2-51589b548b4d'::uuid,'Yamaha Mio Gravis 125cc',60),
 ('609709ab-6952-4ec3-9a13-0a292bb8d52d'::uuid,'Yamaha NMAX 155 V3',85),
 ('f83dec69-7afc-497d-b9d2-16aa754978fb'::uuid,'Suzuki V-Strom 160',85)
) seed(id,name,rate)
where m.id=seed.id and m.display_name=seed.name and m.archived_at is null and m.hourly_extension_rate_php is null;

-- Preserve the exact deployed legacy calculator and its session/public-booking gates.
-- ALTER retains its existing implementation instead of copying an outdated definition.
alter function private.calculate_booking_quote(uuid,timestamptz,timestamptz,boolean) rename to calculate_booking_quote_before_hourly;
revoke all on function private.calculate_booking_quote_before_hourly(uuid,timestamptz,timestamptz,boolean) from public,anon,authenticated;

-- Cheapest daily/7-day/30-day combination covering at least the requested complete days.
-- Covering a shorter period with a cheaper package is allowed; totals are nondecreasing.
create function private.package_rental_php(p_days integer,p_daily integer,p_weekly integer,p_monthly integer)
returns integer language plpgsql immutable set search_path='' as $$
declare costs bigint[] := array[0::bigint]; n integer; best bigint;
begin
 if p_days<0 or p_days>3660 then raise exception 'Rental duration is outside supported pricing range'; end if;
 if p_daily<0 or p_weekly<0 or p_monthly<0 then raise exception 'Invalid rental rates'; end if;
 for n in 1..p_days loop
  best:=costs[n]+p_daily;
  if p_weekly is not null then best:=least(best,costs[greatest(0,n-7)+1]+p_weekly); end if;
  if p_monthly is not null then best:=least(best,costs[greatest(0,n-30)+1]+p_monthly); end if;
  costs:=array_append(costs,best);
 end loop;
 return costs[p_days+1]::integer;
end; $$;
revoke all on function private.package_rental_php(integer,integer,integer,integer) from public,anon,authenticated;

-- Pure arithmetic helper, also covered by the read-only SQL regression suite.
create function private.calculate_hourly_periods(p_seconds numeric,p_daily integer,p_weekly integer,p_monthly integer,p_hourly integer,p_limit integer)
returns jsonb language plpgsql immutable set search_path='' as $$
declare days integer; hours integer; base integer; next_total integer; extension integer:=0; units integer; mode text:='hourly';
begin
 if p_seconds is null or p_seconds<86400 then raise exception 'Minimum rental duration is 24 hours'; end if;
 if p_limit is null or p_limit not between 0 and 23 or p_hourly is null or p_hourly<=0 or p_daily is null or p_daily<0 then raise exception 'Invalid hourly policy or rates'; end if;
 days:=floor(p_seconds/86400)::integer; hours:=ceil(mod(p_seconds,86400)/3600)::integer;
 base:=private.package_rental_php(days,p_daily,p_weekly,p_monthly); units:=days;
 if hours>0 then
  next_total:=private.package_rental_php(days+1,p_daily,p_weekly,p_monthly);
  if hours>p_limit then base:=next_total; units:=days+1; mode:='next_period';
  else extension:=least(hours::bigint*p_hourly,greatest(0,next_total-base))::integer; end if;
 end if;
 return jsonb_build_object('version',1,'mode',mode,'baseDays',units,'completeDays',days,'baseChargePhp',base,'additionalHours',hours,'hourlyRatePhp',p_hourly,'extensionChargePhp',extension,'totalPhp',base+extension,'pricingUnits',case when hours>0 then days+1 else days end,'dailyRatePhp',p_daily,'maxExtensionHours',p_limit,'rounding','Each partial extension hour rounds up; beyond the limit, the next complete day or cheaper package is billed. Hourly charges are capped at that next period.');
end; $$;
revoke all on function private.calculate_hourly_periods(numeric,integer,integer,integer,integer,integer) from public,anon,authenticated;

create function private.hourly_rental_breakdown(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_require_public_enabled boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare legacy record; model public.motorcycle_models%rowtype; limit_hours integer; seconds numeric;
 weekly integer; monthly integer;
begin
 -- Retains operating hours, model publication and active-session/public-booking gates.
 -- Once opted in, old partial-day pricing restrictions must not reject a valid extension.
 select max_hourly_extension_hours into limit_hours from public.booking_settings where id=true;
 select * into model from public.motorcycle_models where id=p_model_id;
 seconds:=extract(epoch from (p_end_at-p_start_at));
 if seconds is null or seconds<86400 then raise exception 'Minimum rental duration is 24 hours'; end if;
 if limit_hours is null or model.hourly_extension_rate_php is null then
  select * into legacy from private.calculate_booking_quote_before_hourly(p_model_id,p_start_at,p_end_at,p_require_public_enabled);
  return jsonb_build_object('version',1,'mode','legacy','baseDays',legacy.pricing_units,'baseChargePhp',legacy.total_php,'additionalHours',0,'hourlyRatePhp',null,'extensionChargePhp',0,'totalPhp',legacy.total_php,'pricingUnits',legacy.pricing_units,'dailyRatePhp',legacy.daily_rate_php);
 end if;
 -- Preserve the authorization and actual-period gates without inheriting
 -- the previous partial-day rejection or calendar-day billing rule.
 declare settings public.booking_settings%rowtype;
 begin
  select * into settings from public.booking_settings where id=true;
  if p_require_public_enabled and not coalesce(((settings.public_booking_enabled and settings.policies_approved_at is not null) or private.is_active_booking_tester(auth.uid())),false) then raise exception 'Online booking is not enabled for this session'; end if;
  if settings.partial_day_policy is distinct from 'started_24_hours' then raise exception 'Hourly extensions require started 24-hour pricing'; end if;
  perform private.assert_booking_period_allowed(p_start_at,p_end_at,settings.operating_hours);
  if model.id is null or not model.is_published or model.archived_at is not null then raise exception 'Motorcycle is unavailable'; end if;
 end;
 -- Honor only current active package rules; never modify the stored rules.
 select min(amount_php) filter(where pricing_type='weekly'),min(amount_php) filter(where pricing_type='monthly') into weekly,monthly
 from public.pricing_rules where motorcycle_model_id=p_model_id and is_active
 and (valid_from is null or valid_from<=p_start_at) and (valid_until is null or valid_until>=p_end_at);
 return private.calculate_hourly_periods(seconds,model.daily_rate_php,weekly,monthly,model.hourly_extension_rate_php,limit_hours);
end; $$;
revoke all on function private.hourly_rental_breakdown(uuid,timestamptz,timestamptz,boolean) from public,anon,authenticated;

-- Same signature for every existing quote, submission and rescheduling caller.
create function private.calculate_booking_quote(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_require_public_enabled boolean)
returns table(pricing_units integer,daily_rate_php integer,total_php integer)
language plpgsql stable security definer set search_path='' as $$
declare detail jsonb;
begin
 detail:=private.hourly_rental_breakdown(p_model_id,p_start_at,p_end_at,p_require_public_enabled);
 return query select (detail->>'pricingUnits')::integer,(detail->>'dailyRatePhp')::integer,(detail->>'totalPhp')::integer;
end; $$;
revoke all on function private.calculate_booking_quote(uuid,timestamptz,timestamptz,boolean) from public,anon,authenticated;

-- Rebind the SQL-language quote wrapper: SQL dependencies can retain the renamed
-- legacy function OID. PL/pgSQL callers resolve the preserved original name.
create or replace function public.get_booking_quote(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz)
returns table(pricing_units integer,daily_rate_php integer,total_php integer)
language sql stable security definer set search_path='' as $$
 select * from private.calculate_booking_quote(p_model_id,p_start_at,p_end_at,true);
$$;
revoke all on function public.get_booking_quote(uuid,timestamptz,timestamptz) from public;
grant execute on function public.get_booking_quote(uuid,timestamptz,timestamptz) to anon,authenticated;

-- Snapshot only new bookings or explicit date/amount changes. No historical backfill.
create function private.snapshot_hourly_rental_pricing() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.start_at is not distinct from old.start_at and new.end_at is not distinct from old.end_at and new.base_total_php is not distinct from old.base_total_php and new.motorcycle_model_id is not distinct from old.motorcycle_model_id then
  new.rental_pricing:=old.rental_pricing; return new;
 end if;
 new.rental_pricing:=private.hourly_rental_breakdown(new.motorcycle_model_id,new.start_at,new.end_at,false);
 if (new.rental_pricing->>'totalPhp')::integer<>new.base_total_php then raise exception 'Server rental breakdown does not match the booking amount'; end if;
 return new;
end; $$;
revoke all on function private.snapshot_hourly_rental_pricing() from public,anon,authenticated;
create trigger booking_hourly_pricing_snapshot before insert or update of start_at,end_at,base_total_php,rental_pricing,motorcycle_model_id on public.bookings for each row execute function private.snapshot_hourly_rental_pricing();

-- New detailed quote; existing V2/V3 contracts and deposit calculation remain intact.
create function public.get_booking_quote_v4(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz,p_extra_items jsonb default '[]',p_deposit_option text default null,p_document_type text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; detail jsonb;
begin
 if p_deposit_option is null then select to_jsonb(q) into result from public.get_booking_quote_v2(p_model_id,p_start_at,p_end_at,p_extra_items) q;
 else select to_jsonb(q) into result from public.get_booking_quote_v3(p_model_id,p_start_at,p_end_at,p_extra_items,p_deposit_option,p_document_type) q; end if;
 detail:=private.hourly_rental_breakdown(p_model_id,p_start_at,p_end_at,true);
 if (detail->>'totalPhp')::integer*100<>(result->>'base_total_centavos')::integer then raise exception 'Pricing changed; request a fresh quote'; end if;
 return result||jsonb_build_object('rental_pricing',detail);
end; $$;
revoke all on function public.get_booking_quote_v4(uuid,timestamptz,timestamptz,jsonb,text,text) from public;
grant execute on function public.get_booking_quote_v4(uuid,timestamptz,timestamptz,jsonb,text,text) to anon,authenticated;

-- Enrich only newly queued messages with the booking's immutable pricing snapshot.
-- Existing recipients, triggers, transports, retry handling and historical messages are untouched.
create function private.notification_hourly_pricing() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.bookings%rowtype;
begin
 select * into b from public.bookings where id=new.booking_id;
 if b.rental_pricing is not null and (new.payload->>'rentalCentavos')::bigint=b.total_centavos then
  new.payload:=new.payload||jsonb_build_object('rentalPricing',b.rental_pricing);
 end if;
 return new;
end; $$;
revoke all on function private.notification_hourly_pricing() from public,anon,authenticated;
create trigger notification_hourly_pricing before insert on public.notification_outbox for each row execute function private.notification_hourly_pricing();
commit;
