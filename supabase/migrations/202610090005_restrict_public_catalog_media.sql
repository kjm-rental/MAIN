-- Publish only media with an approved license basis and completed verification.
-- Authenticated active admins retain full access through motorcycle_media_admin_all.

drop policy if exists motorcycle_media_public_read on public.motorcycle_media;

create policy motorcycle_media_public_read
on public.motorcycle_media for select to anon, authenticated
using (
  verification_status = 'verified'
  and license_status in ('business_owned', 'licensed', 'permission_granted')
  and license_source_url is not null
  and license_note is not null
  and exists (
    select 1 from public.motorcycle_models model
    where model.id = motorcycle_model_id and model.is_published = true
  )
);

comment on policy motorcycle_media_public_read on public.motorcycle_media is
  'Only approved, licensed media for published models is visible publicly.';
