-- Owner policy: 10% of the daily rate per started hour, up to 2 hours;
-- more than 2 hours bills the next full day. Saved booking snapshots stay intact.
begin;
set local lock_timeout='10s';
set local statement_timeout='60s';
lock table public.bookings,public.motorcycle_models,public.booking_settings in access exclusive mode;
create temp table pricing_before on commit drop as
 select id,base_total_centavos,total_centavos,rental_pricing from public.bookings;
create temp table pricing_return_functions on commit drop as
 select p.oid::regprocedure::text identity,pg_get_functiondef(p.oid) definition,p.proacl acl,
 format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) signature
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname='calculate_booking_quote')
 or (n.nspname='public' and p.proname in ('get_booking_quote','get_booking_quote_with_extras'));
-- Exact centavo arithmetic requires fractional PHP totals (e.g. 499 + 49.90).
-- Rebuild only the two dependent generated columns; their values are asserted below.
drop trigger booking_hourly_pricing_snapshot on public.bookings;
alter table public.bookings drop column base_total_centavos,drop column total_centavos;
alter table public.bookings alter column base_total_php type numeric(12,2),alter column quoted_total_php type numeric(12,2),alter column manual_adjustment_php type numeric(12,2);
alter table public.bookings add column base_total_centavos integer generated always as ((round(base_total_php*100))::integer) stored,
 add column total_centavos integer generated always as ((round(quoted_total_php*100))::integer) stored;
alter table public.motorcycle_models alter column hourly_extension_rate_php type numeric(12,2);
alter table public.motorcycle_models drop constraint motorcycle_models_hourly_extension_rate_php_check;
alter table public.motorcycle_models add constraint motorcycle_models_hourly_extension_rate_php_check check(hourly_extension_rate_php>=0);
update public.motorcycle_models set hourly_extension_rate_php=daily_rate_php::numeric/10;
create function private.derive_owner_hourly_rate() returns trigger language plpgsql set search_path='' as $$
begin new.hourly_extension_rate_php:=new.daily_rate_php::numeric/10;return new;end;$$;
revoke all on function private.derive_owner_hourly_rate() from public,anon,authenticated;
create trigger derive_owner_hourly_rate before insert or update of daily_rate_php,hourly_extension_rate_php on public.motorcycle_models for each row execute function private.derive_owner_hourly_rate();
update public.booking_settings set max_hourly_extension_hours=2 where id;
alter table public.booking_settings alter column max_hourly_extension_hours set default 2,alter column max_hourly_extension_hours set not null;
alter table public.booking_settings add constraint owner_two_hour_extension_limit check(max_hourly_extension_hours=2);
create function private.owner_extension_periods(p_seconds numeric,p_daily integer,p_weekly integer,p_monthly integer)
returns jsonb language plpgsql immutable set search_path='' as $$
declare days integer; hours integer; units integer; base numeric; extension numeric:=0; hourly numeric; mode text:='hourly';
begin
 if p_seconds is null or p_seconds<86400 then raise exception 'Minimum rental duration is 24 hours';end if;
 if p_daily is null or p_daily<0 then raise exception 'Invalid rental rate';end if;
 days:=floor(p_seconds/86400)::integer;hours:=ceil(mod(p_seconds,86400)/3600)::integer;units:=days;
 hourly:=p_daily::numeric/10;base:=private.package_rental_php(days,p_daily,p_weekly,p_monthly);
 if hours>2 then units:=days+1;base:=private.package_rental_php(units,p_daily,p_weekly,p_monthly);mode:='next_period';
 elsif hours>0 then extension:=hours*hourly;end if;
 return jsonb_build_object('version',1,'extensionPolicy','ten_percent_two_hours','mode',mode,'baseDays',units,'completeDays',days,
 'baseChargePhp',base,'additionalHours',hours,'hourlyRatePhp',hourly,'extensionChargePhp',extension,'totalPhp',base+extension,
 'pricingUnits',case when hours>0 then days+1 else days end,'dailyRatePhp',p_daily,'maxExtensionHours',2,
 'rounding','Each partial extension hour rounds up. Up to 2 hours costs 10% of the daily rate per hour; more than 2 hours bills the next full rental day.');
end;$$;
revoke all on function private.owner_extension_periods(numeric,integer,integer,integer) from public,anon,authenticated;
do $patch$
declare definition text; fragment text; f record; grant_row record;
begin
 -- Preserve publication, authorization, operating-hours and package selection checks.
 definition:=pg_get_functiondef('private.hourly_rental_breakdown(uuid,timestamptz,timestamptz,boolean)'::regprocedure);
 definition:=regexp_replace(definition,' if limit_hours is null or model.hourly_extension_rate_php is null then.*? end if;','','s');
 if position('return private.calculate_hourly_periods(seconds,model.daily_rate_php,weekly,monthly,model.hourly_extension_rate_php,limit_hours);' in definition)=0 then raise exception 'Unexpected hourly calculator; review migration';end if;
 definition:=replace(definition,'return private.calculate_hourly_periods(seconds,model.daily_rate_php,weekly,monthly,model.hourly_extension_rate_php,limit_hours);','return private.owner_extension_periods(seconds,model.daily_rate_php,weekly,monthly);');
 execute definition;
 -- Change PHP-returning contracts to numeric without cascading through any objects.
 for f in select * from pricing_return_functions order by signature like 'private.%' loop execute 'drop function '||f.signature;end loop;
 for f in select * from pricing_return_functions order by signature not like 'private.%' loop
  definition:=regexp_replace(f.definition,$rx$\mtotal_php integer\M$rx$,'total_php numeric','g');
  definition:=regexp_replace(definition,$rx$\mbase_total_php integer\M$rx$,'base_total_php numeric','g');
  definition:=replace(definition,$old$(detail->>'totalPhp')::integer$old$,$new$(detail->>'totalPhp')::numeric$new$);
  execute definition;
  execute 'revoke all on function '||f.signature||' from public,anon,authenticated,service_role';
  for grant_row in select case when x.grantee=0 then 'PUBLIC' else quote_ident(r.rolname) end role_name,x.is_grantable from aclexplode(f.acl) x left join pg_roles r on r.oid=x.grantee where x.privilege_type='EXECUTE' loop
   execute 'grant execute on function '||f.signature||' to '||grant_row.role_name||case when grant_row.is_grantable then ' with grant option' else '' end;
  end loop;
 end loop;
 -- Guest payloads use integer centavos; divide in numeric arithmetic.
 definition:=pg_get_functiondef('public.submit_guest_booking_request_core(jsonb,text)'::regprocedure);
 definition:=replace(definition,'q.total_centavos/100','q.total_centavos/100.0');
 definition:=replace(definition,'q.base_total_centavos/100','q.base_total_centavos/100.0');execute definition;
 -- Manual bookings retain centavo-precise base/final totals and adjustments.
 definition:=pg_get_functiondef('public.admin_quote_manual_booking(jsonb)'::regprocedure);
 definition:=replace(definition,'standard integer; final integer;','standard numeric; final numeric;');execute definition;
 definition:=pg_get_functiondef('public.admin_save_manual_booking(jsonb)'::regprocedure);
 foreach fragment in array array['final','base','adjustment'] loop
  definition:=replace(definition,format('(q->>%L)::integer',fragment),format('(q->>%L)::numeric',fragment));
 end loop;
 definition:=replace(definition,$old$(p_payload->>'expectedTotal')::integer$old$,$new$(p_payload->>'expectedTotal')::numeric$new$);execute definition;
 -- Centavo-returning APIs remain integer and exact.
 definition:=pg_get_functiondef('public.get_booking_quote_v2(uuid,timestamptz,timestamptz,jsonb)'::regprocedure);
 definition:=replace(definition,'q.total_php*100','(round(q.total_php*100))::integer');
 definition:=replace(definition,'(q.total_php+extras_php)*100','(round((q.total_php+extras_php)*100))::integer');execute definition;
 definition:=pg_get_functiondef('public.get_booking_quote_v4(uuid,timestamptz,timestamptz,jsonb,text,text)'::regprocedure);
 definition:=replace(definition,$old$(detail->>'totalPhp')::integer*100$old$,$new$round((detail->>'totalPhp')::numeric*100)::integer$new$);execute definition;
 definition:=pg_get_functiondef('private.snapshot_hourly_rental_pricing()'::regprocedure);
 definition:=replace(definition,$old$(new.rental_pricing->>'totalPhp')::integer$old$,$new$(new.rental_pricing->>'totalPhp')::numeric$new$);execute definition;
end;$patch$;
create trigger booking_hourly_pricing_snapshot before insert or update of start_at,end_at,base_total_php,rental_pricing,motorcycle_model_id on public.bookings for each row execute function private.snapshot_hourly_rental_pricing();
do $$begin
 if exists(select 1 from pricing_before p full join public.bookings b on p.id=b.id where p.id is null or b.id is null or p.base_total_centavos is distinct from b.base_total_centavos or p.total_centavos is distinct from b.total_centavos or p.rental_pricing is distinct from b.rental_pricing) then raise exception 'Existing booking prices changed';end if;
end;$$;
notify pgrst,'reload schema';
commit;
