-- REVIEW / MANUAL RUN ONLY, after migration 032. No booking/model/settings writes.
-- Execute as migration owner: pricing helpers deliberately have no public grants.
begin;
do $$
declare q jsonb; test record;
begin
 for test in select * from (values
  (24::numeric,700,23,'exactly 24h'),
  (48,1400,23,'exactly 48h'),
  (49,1470,23,'48h + 1h'),
  (53,1750,23,'48h + 5h'),
  (53,2100,2,'beyond 2-hour extension limit'),
  (49.01,1540,23,'fractional hour rounds up'),
  (48.001,1470,23,'partial first extra hour'),
  (71.99,2100,23,'24 rounded hours roll to complete day'),
  (49,2100,0,'explicit zero-hour policy')
 ) t(hours,total,limit_hours,label) loop
  q:=private.calculate_hourly_periods(test.hours*3600,700,null,null,70,test.limit_hours);
  if (q->>'totalPhp')::integer<>test.total then raise exception 'FAILED %: %',test.label,q; end if;
 end loop;
 q:=private.calculate_hourly_periods(53*3600,700,null,null,300,23);
 if (q->>'extensionChargePhp')::integer<>700 or (q->>'totalPhp')::integer<>2100 then raise exception 'Hourly cap failed'; end if;
 q:=private.calculate_hourly_periods(7*86400,700,4000,14000,70,23);
 if (q->>'totalPhp')::integer<>4000 then raise exception 'Weekly pricing failed'; end if;
 q:=private.calculate_hourly_periods(30*86400,700,4000,14000,70,23);
 if (q->>'totalPhp')::integer<>14000 then raise exception 'Monthly pricing failed'; end if;
 q:=private.calculate_hourly_periods(7*86400+5*3600,700,4000,14000,70,23);
 if (q->>'totalPhp')::integer<>4350 then raise exception 'Weekly plus extension failed'; end if;
 q:=private.calculate_hourly_periods(6*86400+5*3600,700,4000,null,70,23);
 if (q->>'totalPhp')::integer<>4000 then raise exception 'Cheaper next package cap failed'; end if;
 begin
  perform private.calculate_hourly_periods(23*3600,700,null,null,70,23);
  raise exception 'FAILED minimum duration';
 exception when others then
  if sqlerrm not like 'Minimum rental duration%' then raise; end if;
 end;
end $$;
rollback;
