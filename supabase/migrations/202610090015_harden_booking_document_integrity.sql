-- Harden guest document uploads before anonymous customer checkout is enabled.
-- This migration changes no booking settings and deletes no data.

alter table public.customer_verifications
  add constraint customer_verifications_id_booking_unique unique (id, booking_id);

alter table public.verification_documents
  drop constraint verification_documents_verification_id_fkey;
alter table public.verification_documents
  add constraint verification_documents_verification_booking_fkey
  foreign key (verification_id, booking_id)
  references public.customer_verifications (id, booking_id)
  on delete cascade;

drop policy identity_documents_owner_insert on storage.objects;
create policy identity_documents_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'identity-verification'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.bookings booking
    join public.customers customer on customer.id = booking.customer_id
    where booking.id::text = (storage.foldername(name))[2]
      and customer.auth_user_id = (select auth.uid())
      and booking.status in ('submitted', 'pending')
      and (booking.expires_at is null or booking.expires_at > now())
  )
);

drop policy verification_documents_owner_insert on public.verification_documents;
create policy verification_documents_owner_insert on public.verification_documents
for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and storage_path like (select auth.uid())::text || '/' || booking_id::text || '/%'
  and exists (
    select 1
    from public.customer_verifications verification
    join public.bookings booking on booking.id = verification.booking_id
    join public.customers customer on customer.id = booking.customer_id
    where verification.id = verification_id
      and verification.booking_id = booking_id
      and customer.auth_user_id = (select auth.uid())
      and booking.status in ('submitted', 'pending')
      and (booking.expires_at is null or booking.expires_at > now())
  )
  and exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'identity-verification'
      and object.name = storage_path
      and (storage.foldername(object.name))[1] = (select auth.uid())::text
  )
);

comment on constraint verification_documents_verification_booking_fkey
on public.verification_documents is
  'Prevents a customer document from referencing a verification record belonging to another booking.';
