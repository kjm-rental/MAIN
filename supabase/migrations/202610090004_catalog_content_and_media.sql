-- KJM Motorcycle Rental — additive catalog content and governed media storage
-- This migration is authored for review. It does not upload media or touch a live project.

alter table public.motorcycle_models
  add column if not exists exact_model_name text,
  add column if not exists model_year text,
  add column if not exists transmission text,
  add column if not exists fuel_tank_capacity_liters numeric(4,1)
    check (fuel_tank_capacity_liters is null or fuel_tank_capacity_liters > 0),
  add column if not exists cooling_system text,
  add column if not exists starting_system text,
  add column if not exists braking_system text,
  add column if not exists category text,
  add column if not exists notable_features jsonb not null default '[]'::jsonb
    check (jsonb_typeof(notable_features) = 'array'),
  add column if not exists specification_status text not null default 'pending'
    check (specification_status in ('verified', 'reference_only', 'pending')),
  add column if not exists specification_note text not null default 'Exact model year and variant pending confirmation.',
  add column if not exists specification_source_url text
    check (specification_source_url is null or specification_source_url ~ '^https://');

alter table public.motorcycle_media
  add column if not exists media_kind text not null default 'photo'
    check (media_kind in ('photo', 'illustration')),
  add column if not exists license_status text not null default 'pending'
    check (license_status in ('business_owned', 'licensed', 'permission_granted', 'pending')),
  add column if not exists license_source_url text
    check (license_source_url is null or license_source_url ~ '^https://'),
  add column if not exists license_note text,
  add column if not exists verification_status text not null default 'pending'
    check (verification_status in ('verified', 'pending', 'rejected')),
  add column if not exists updated_at timestamptz not null default now();

create trigger motorcycle_media_set_updated_at before update on public.motorcycle_media
for each row execute function public.set_updated_at();

update public.motorcycle_models as model
set
  description = content.description,
  exact_model_name = content.exact_model_name,
  model_year = content.model_year,
  engine_cc = content.engine_cc,
  transmission = content.transmission,
  fuel_tank_capacity_liters = content.fuel_tank_capacity_liters,
  cooling_system = content.cooling_system,
  starting_system = content.starting_system,
  braking_system = content.braking_system,
  category = content.category,
  notable_features = content.notable_features::jsonb,
  specification_status = content.specification_status,
  specification_note = content.specification_note,
  specification_source_url = content.specification_source_url
from (values
  ('honda-beat', 'A compact automatic scooter suited to short city trips and everyday errands. KJM''s exact model year and variant still need confirmation before variant-specific features are published.', 'BeAT', null, 110, 'Automatic (V-Matic)', null, 'Air-cooled', 'Electric and kick (ACG starter)', null, 'Automatic scooter', '[]', 'reference_only', 'Honda Philippines brochures show different tank capacities and brake variants by generation. Confirm KJM''s model year and variant before publishing those fields.', 'https://cms.hondaph.com/files/products/650bce64c3201.pdf'),
  ('yamaha-mio-gravis-125cc', 'An automatic scooter positioned for practical urban riding. The exact KJM unit year and variant must be confirmed before technical details are shown.', 'Mio Gravis', null, null, null, null, null, null, null, 'Automatic scooter', '[]', 'pending', 'Yamaha Philippines confirms the Mio Gravis name, but an authoritative specification sheet for KJM''s year and variant has not been matched.', 'https://www.yamaha-motor.com.ph/motorcycles/personal-commuter/mio-series/mio-gravis'),
  ('honda-click-125cc', 'A compact automatic scooter for city routes and everyday travel. Its liquid-cooled 125 cc engine and under-seat storage make it a practical catalog option.', 'Click125', '2026 manufacturer reference', 125, 'Automatic (V-Matic)', 5.5, 'Liquid-cooled', 'Electric', 'Front hydraulic disc; rear mechanical drum; CBS', 'Automatic scooter', '["LED lighting", "USB Type-C charger", "18 L luggage box"]', 'verified', 'Verified against Honda Philippines'' 2026 brochure. KJM''s physical rental-unit year and Standard/Smart Edition variant remain to be confirmed.', 'https://cms.hondaph.com/files/products/69847c092a3af.pdf'),
  ('honda-click-160cc', 'A sport-styled automatic scooter with a 157 cc liquid-cooled engine. It suits riders looking for a step up in capacity while keeping scooter convenience.', 'Click160', null, 157, 'Automatic (V-Matic)', 5.5, 'Liquid-cooled', 'Electric (ACG starter)', 'Front hydraulic disc; rear mechanical drum; CBS', 'Automatic scooter', '["Smart key system", "USB charger", "LED lighting"]', 'verified', 'Verified against a Honda Philippines brochure; KJM''s physical rental-unit year remains to be confirmed.', 'https://cms.hondaph.com/files/products/62da5a937198e.pdf'),
  ('yamaha-aerox-160cc', 'A sport-styled automatic model in KJM''s provisional catalog. Yamaha Philippines markets the model as AEROX, so the listed 160cc designation must be confirmed against the rental unit before specifications are published.', null, null, null, null, null, null, null, null, 'Automatic scooter', '[]', 'pending', 'Client label is provisional: Yamaha Philippines currently markets AEROX and AEROX SP, not a model named Aerox 160cc. Confirm the unit registration/model year and variant.', 'https://www.yamaha-motor.com.ph/yecvt'),
  ('honda-pcx-160cc', 'A larger automatic scooter with a relaxed riding layout and a 157 cc liquid-cooled engine. Its 8 L fuel tank and built-in storage support both local trips and longer day routes.', 'PCX160', null, 157, 'Automatic (V-Matic)', 8.0, 'Liquid-cooled', 'Electric (ACG starter)', null, 'Automatic scooter', '["Smart key system", "USB Type-C socket", "30 L luggage box"]', 'verified', 'Core specifications are verified against Honda Philippines. ABS/CBS equipment varies by variant, so the braking system remains unpublished pending KJM unit confirmation.', 'https://cms.hondaph.com/files/products/64c22fd79c9ca.pdf'),
  ('yamaha-nmax-155cc', 'A premium automatic scooter intended for composed urban and open-road travel. KJM''s exact NMAX year and variant must be identified before variant-dependent specifications are presented.', 'NMAX', null, null, null, null, null, null, null, 'Automatic scooter', '[]', 'pending', 'Yamaha Philippines lists multiple NMAX variants with differing equipment. Confirm KJM''s model year and exact variant before publishing technical fields.', 'https://www.yamaha-motor.com.ph/yecvt'),
  ('honda-adv-160', 'An adventure-styled automatic scooter with an upright layout and a 157 cc liquid-cooled engine. It is designed to balance daily scooter practicality with a more touring-oriented format.', 'ADV160', null, 157, 'Automatic (V-Matic)', 8.1, 'Liquid-cooled', 'Electric (ACG starter)', 'Front and rear hydraulic disc; front ABS', 'Adventure-styled automatic scooter', '["Honda Selectable Torque Control", "Adjustable windscreen", "USB charger"]', 'verified', 'Verified against Honda Philippines ADV160 materials; KJM''s physical rental-unit year remains to be confirmed.', 'https://www.hondaph.com/motorcycle/news/discover-new-excitement-with-the-all-new-adv160'),
  ('suzuki-v-strom-160', 'A lightweight adventure motorcycle with an upright riding position, manual gearbox and 13 L fuel tank. Its format is oriented toward mixed city and longer paved-road journeys.', 'V-STROM 160', '2026 Philippine-market reference', 162, '5-speed manual', 13.0, 'Air-cooled', 'Electric', 'Front and rear single disc with dual-channel ABS', 'Adventure motorcycle', '["Digital instrument panel", "USB port", "Adjustable rear suspension"]', 'verified', 'The model name and specifications are verified on Suzuki Motorcycles Philippines. Confirm that KJM''s physical unit is this newly listed Philippine-market model.', 'https://mc.suzuki.com.ph/motorcycles/backbone/v-strom-160/'),
  ('honda-adv-350', 'A mid-capacity adventure-styled automatic scooter built for a more substantial touring format. Honda''s ADV350 uses a 330 cc engine; KJM''s unit market, model year and variant still need confirmation.', 'ADV350', '2026 UK-market reference', 330, 'Automatic (CVT)', 11.7, 'Liquid-cooled', 'Electric', 'Front and rear hydraulic disc with ABS', 'Adventure-styled automatic scooter', '["Honda Selectable Torque Control", "Adjustable windscreen", "Smart key system"]', 'reference_only', 'These are Honda UK''s 2026 ADV350 reference specifications, not yet verified for KJM''s physical unit or Philippine-market configuration.', 'https://www.honda.co.uk/motorcycles/range/scooter/adv350/specification-and-price.html')
) as content(slug, description, exact_model_name, model_year, engine_cc, transmission, fuel_tank_capacity_liters, cooling_system, starting_system, braking_system, category, notable_features, specification_status, specification_note, specification_source_url)
where model.slug = content.slug;

-- Existing column-level public grants do not automatically include new columns.
grant select (exact_model_name, model_year, transmission, fuel_tank_capacity_liters,
  cooling_system, starting_system, braking_system, category, notable_features,
  specification_status, specification_note, specification_source_url)
on public.motorcycle_models to anon, authenticated;

grant select (media_kind, license_status, license_source_url, license_note,
  verification_status, updated_at)
on public.motorcycle_media to anon, authenticated;

-- Public catalog bucket: reads are public; only active admins may mutate objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'motorcycle-catalog',
  'motorcycle-catalog',
  true,
  8388608,
  array['image/avif', 'image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy motorcycle_catalog_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'motorcycle-catalog' and (select private.is_active_admin()));

create policy motorcycle_catalog_admin_update on storage.objects
for update to authenticated
using (bucket_id = 'motorcycle-catalog' and (select private.is_active_admin()))
with check (bucket_id = 'motorcycle-catalog' and (select private.is_active_admin()));

create policy motorcycle_catalog_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'motorcycle-catalog' and (select private.is_active_admin()));

comment on column public.motorcycle_models.specification_status is
  'Verification state for manufacturer-reference specifications, not physical-unit inspection.';
comment on column public.motorcycle_media.license_status is
  'Must be business_owned, licensed, or permission_granted before publication.';
