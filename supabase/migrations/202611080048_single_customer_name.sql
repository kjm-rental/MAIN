-- Customer name is entered once. Document names and vehicle categories are
-- reviewed from uploaded evidence; absent declarations remain NULL.
begin;
do $patch$
declare definition text; fragment text;
begin
 definition:=pg_get_functiondef('public.submit_guest_booking_request_core(jsonb,text)'::regprocedure);
 foreach fragment in array array[
  $remove$length(btrim(coalesce(p_payload->>'p_identity_name','')))=0 or $remove$,
  $remove$length(btrim(coalesce(p_payload->>'p_license_name','')))=0 or $remove$,
  $remove$ or length(btrim(coalesce(p_payload->>'p_vehicle_categories','')))=0$remove$
 ] loop
  if position(fragment in definition)=0 then raise exception 'Unexpected guest submission definition; review single-name migration';end if;
  definition:=replace(definition,fragment,'');
 end loop;
 execute definition;
 definition:=pg_get_functiondef('public.finalize_guest_booking_request(uuid,text,text,boolean)'::regprocedure);
 foreach fragment in array array[
  $remove$ or length(trim(coalesce(v.identity_name,'')))=0$remove$,
  $remove$ or length(trim(coalesce(v.license_name,'')))=0$remove$,
  $remove$ or length(trim(coalesce(v.permitted_vehicle_categories,'')))=0$remove$
 ] loop
  if position(fragment in definition)=0 then raise exception 'Unexpected guest finalization definition; review single-name migration';end if;
  definition:=replace(definition,fragment,'');
 end loop;
 execute definition;
end;$patch$;
notify pgrst,'reload schema';
commit;
