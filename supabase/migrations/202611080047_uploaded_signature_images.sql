-- Signature images are normalized to PNG on the server; no public object URL.
begin;
alter table public.booking_electronic_signatures add column signature_image_base64 text;
alter table public.booking_electronic_signatures drop constraint booking_electronic_signatures_method_check;
alter table public.booking_electronic_signatures add constraint booking_electronic_signatures_method_check check(method in ('typed_full_name','drawn','uploaded'));
alter table public.booking_electronic_signatures add constraint uploaded_signature_required check (
 (method='uploaded' and signature_strokes is null and signature_image_base64 is not null and length(signature_image_base64) between 32 and 1400000)
 or (method<>'uploaded' and signature_image_base64 is null)
);
create function public.upload_and_finalize_guest_booking_request(p_booking_id uuid,p_access_hash text,p_terms_version text,p_terms_accepted boolean,p_signature_name text,p_signature_image text)
returns table(booking_status text,verification_status text)
language plpgsql security definer set search_path='' as $$
declare existing public.booking_electronic_signatures%rowtype; bytes bytea;
begin
 if auth.role() is distinct from 'service_role' or length(trim(coalesce(p_signature_name,''))) not between 2 and 160 then
  raise exception 'Server authorization and signature required'; end if;
 if p_signature_image is null or length(p_signature_image) not between 32 and 1400000 or p_signature_image !~ '^[A-Za-z0-9+/]+={0,2}$' then raise exception 'Invalid signature image';end if;
 bytes:=decode(p_signature_image,'base64');
 if octet_length(bytes)>1000000 or substring(bytes from 1 for 8)<>decode('89504e470d0a1a0a','hex') then raise exception 'PNG signature required';end if;
 perform 1 from public.bookings b join public.guest_booking_contacts g on g.booking_id=b.id
 where b.id=p_booking_id and g.access_hash=p_access_hash for update of b;
 if not found then raise exception 'Booking not found';end if;
 select * into existing from public.booking_electronic_signatures where booking_id=p_booking_id;
 if found and (existing.method<>'uploaded' or existing.signature_name<>trim(p_signature_name) or existing.terms_version<>p_terms_version or existing.signature_image_base64 is distinct from p_signature_image) then
  raise exception 'Recorded signature is immutable';end if;
 return query select * from public.finalize_guest_booking_request(p_booking_id,p_access_hash,p_terms_version,p_terms_accepted);
 insert into public.booking_electronic_signatures(booking_id,signature_name,terms_version,signature_image_base64,method)
 values(p_booking_id,trim(p_signature_name),p_terms_version,p_signature_image,'uploaded') on conflict(booking_id) do nothing;
end;$$;
revoke all on function public.upload_and_finalize_guest_booking_request(uuid,text,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.upload_and_finalize_guest_booking_request(uuid,text,text,boolean,text,text) to service_role;
notify pgrst,'reload schema';
commit;
