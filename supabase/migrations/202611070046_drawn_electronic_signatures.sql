-- Drawn signatures replace typed-name signing. Apply after migration 045.
begin;
alter table public.booking_electronic_signatures add column signature_strokes jsonb;
alter table public.booking_electronic_signatures drop constraint booking_electronic_signatures_method_check;
alter table public.booking_electronic_signatures add constraint booking_electronic_signatures_method_check check(method in ('typed_full_name','drawn'));
alter table public.booking_electronic_signatures add constraint drawn_signature_required check(method<>'drawn' or (signature_strokes is not null and jsonb_typeof(signature_strokes)='array'));
-- Keep existing typed signatures readable; new finalization must use a drawing.
revoke execute on function public.sign_and_finalize_guest_booking_request(uuid,text,text,boolean,text) from service_role;
create function public.draw_and_finalize_guest_booking_request(p_booking_id uuid,p_access_hash text,p_terms_version text,p_terms_accepted boolean,p_signature_name text,p_signature_strokes jsonb)
returns table(booking_status text,verification_status text)
language plpgsql security definer set search_path='' as $$
declare existing public.booking_electronic_signatures%rowtype; stroke jsonb; point jsonb; total_points integer:=0; first_x numeric; first_y numeric; has_ink boolean:=false;
begin
 if auth.role() is distinct from 'service_role' or length(trim(coalesce(p_signature_name,''))) not between 2 and 160 then
  raise exception 'Server authorization and electronic signature required';
 end if;
 if jsonb_typeof(p_signature_strokes) is distinct from 'array' or jsonb_array_length(p_signature_strokes) not between 1 and 100 or octet_length(p_signature_strokes::text)>1000000 then
  raise exception 'Draw your signature';
 end if;
 for stroke in select value from jsonb_array_elements(p_signature_strokes) loop
  if jsonb_typeof(stroke)<>'array' or jsonb_array_length(stroke) not between 2 and 2000 then raise exception 'Invalid signature stroke';end if;
  total_points:=total_points+jsonb_array_length(stroke);
  first_x:=(stroke->0->>'x')::numeric; first_y:=(stroke->0->>'y')::numeric;
  for point in select value from jsonb_array_elements(stroke) loop
   if jsonb_typeof(point->'x') is distinct from 'number' or jsonb_typeof(point->'y') is distinct from 'number'
     or (point->>'x')::numeric not between 0 and 1 or (point->>'y')::numeric not between 0 and 1 then raise exception 'Invalid signature point';end if;
   if power((point->>'x')::numeric-first_x,2)+power((point->>'y')::numeric-first_y,2)>0.0004 then has_ink:=true;end if;
  end loop;
 end loop;
 if total_points>10000 or not has_ink then raise exception 'Draw your signature';end if;
 -- Serialize retries and verify ownership before reading any signature.
 perform 1 from public.bookings b join public.guest_booking_contacts g on g.booking_id=b.id
 where b.id=p_booking_id and g.access_hash=p_access_hash for update of b;
 if not found then raise exception 'Booking not found';end if;
 select * into existing from public.booking_electronic_signatures where booking_id=p_booking_id;
 if found and (existing.signature_name<>trim(p_signature_name) or existing.terms_version<>p_terms_version or existing.signature_strokes is distinct from p_signature_strokes) then
  raise exception 'Recorded signature is immutable';
 end if;
 return query select * from public.finalize_guest_booking_request(p_booking_id,p_access_hash,p_terms_version,p_terms_accepted);
 insert into public.booking_electronic_signatures(booking_id,signature_name,terms_version,signature_strokes,method)
 values(p_booking_id,trim(p_signature_name),p_terms_version,p_signature_strokes,'drawn') on conflict(booking_id) do nothing;
end;$$;
revoke all on function public.draw_and_finalize_guest_booking_request(uuid,text,text,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.draw_and_finalize_guest_booking_request(uuid,text,text,boolean,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
