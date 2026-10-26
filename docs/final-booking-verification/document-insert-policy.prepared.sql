-- REVIEW ONLY. Not a numbered/applied migration. Do not run against production.
-- Narrow correction to migration 015's customer metadata INSERT policy.
-- Existing ADMIN policy and the privileged correction RPC are unchanged.
-- Validate isolated PostgreSQL/RLS behavior before approval/application.
alter policy verification_documents_owner_insert on public.verification_documents
with check (
  owner_user_id = (select auth.uid())
  and status = 'submitted'
  and replaced_at is null
  and storage_path like (select auth.uid())::text || '/' || booking_id::text || '/%'
  and exists (
    select 1
    from public.customer_verifications verification
    join public.bookings booking on booking.id = verification.booking_id
    join public.customers customer on customer.id = booking.customer_id
    where verification.id = verification_documents.verification_id
      and verification.booking_id = verification_documents.booking_id
      and customer.auth_user_id = (select auth.uid())
      and booking.status in ('submitted', 'pending')
      and (booking.expires_at is null or booking.expires_at > now())
  )
  and exists (
    select 1 from storage.objects object
    where object.bucket_id = 'identity-verification'
      and object.name = verification_documents.storage_path
      and (storage.foldername(object.name))[1] = (select auth.uid())::text
      and object.metadata->>'mimetype' = verification_documents.mime_type
      and (object.metadata->>'size')::integer = verification_documents.size_bytes
  )
);
