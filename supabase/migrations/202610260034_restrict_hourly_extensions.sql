-- REVIEW REQUIRED. Changes no saved prices, rates, policy limits or bookings.
begin;
create or replace function private.calculate_hourly_periods(p_seconds numeric,p_daily integer,p_weekly integer,p_monthly integer,p_hourly integer,p_limit integer)
returns jsonb language plpgsql immutable set search_path='' as $$
declare days integer; hours integer; base integer; next_total integer; extension integer:=0; units integer; mode text:='hourly';
begin
 if p_seconds is null or p_seconds<86400 then raise exception 'Minimum rental duration is 24 hours'; end if;
 if p_limit is null or p_limit not between 0 and 23 or p_hourly is null or p_hourly<=0 or p_daily is null or p_daily<0 then raise exception 'Invalid hourly policy or rates'; end if;
 days:=floor(p_seconds/86400)::integer; hours:=ceil(mod(p_seconds,86400)/3600)::integer;
 base:=private.package_rental_php(days,p_daily,p_weekly,p_monthly); units:=days;
 if hours>0 then
  next_total:=private.package_rental_php(days+1,p_daily,p_weekly,p_monthly);
  if hours>p_limit then raise exception 'Selected extension is % rounded hours; the configured maximum is % hours. Choose an earlier return or a complete 24-hour period.',hours,p_limit;
  else extension:=least(hours::bigint*p_hourly,greatest(0,next_total-base))::integer; end if;
 end if;
 return jsonb_build_object('version',1,'mode',mode,'baseDays',units,'completeDays',days,'baseChargePhp',base,'additionalHours',hours,'hourlyRatePhp',p_hourly,'extensionChargePhp',extension,'totalPhp',base+extension,'pricingUnits',case when hours>0 then days+1 else days end,'dailyRatePhp',p_daily,'maxExtensionHours',p_limit,'rounding','Each partial extension hour rounds up; extensions beyond the configured limit are not permitted. Hourly charges are capped at that next period.');
end; $$;
revoke all on function private.calculate_hourly_periods(numeric,integer,integer,integer,integer,integer) from public,anon,authenticated;

commit;
