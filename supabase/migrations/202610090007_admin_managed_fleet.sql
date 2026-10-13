-- Additive support for admin-managed catalog lifecycle and cover media.

alter table public.motorcycle_models
  add column if not exists generation text,
  add column if not exists archived_at timestamptz;

alter table public.motorcycle_units
  add column if not exists archived_at timestamptz;

alter table public.motorcycle_media
  add column if not exists is_primary boolean not null default false;

create unique index if not exists motorcycle_media_one_primary_per_model_idx
on public.motorcycle_media (motorcycle_model_id)
where is_primary = true;

create index if not exists motorcycle_models_public_catalog_idx
on public.motorcycle_models (is_published, archived_at, daily_rate_php);

-- Legacy migration seeds must be reviewed in KJM ADMIN before they are public.
-- This is deliberately scoped to the original ten seed slugs and preserves all rows.
update public.motorcycle_models
set is_published = false
where slug in (
  'honda-beat', 'yamaha-mio-gravis-125cc', 'honda-click-125cc',
  'honda-click-160cc', 'yamaha-aerox-160cc', 'honda-pcx-160cc',
  'yamaha-nmax-155cc', 'honda-adv-160', 'suzuki-v-strom-160',
  'honda-adv-350'
);

grant insert on public.audit_logs to authenticated;
create policy audit_logs_admin_insert on public.audit_logs
for insert to authenticated
with check (
  (select private.is_active_admin())
  and actor_user_id = (select auth.uid())
);

grant select (generation, archived_at)
on public.motorcycle_models to anon, authenticated;
grant select (is_primary)
on public.motorcycle_media to anon, authenticated;

drop policy if exists motorcycle_models_public_read on public.motorcycle_models;
create policy motorcycle_models_public_read
on public.motorcycle_models for select to anon, authenticated
using (is_published = true and archived_at is null);

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
    where model.id = motorcycle_model_id
      and model.is_published = true
      and model.archived_at is null
  )
);

comment on column public.motorcycle_models.archived_at is
  'Soft-delete marker. Archived models are excluded from the public catalog.';
comment on column public.motorcycle_media.is_primary is
  'At most one verified cover image per motorcycle model.';
