-- KJM Motorcycle Rental — verified model-level catalog seed
-- ON CONFLICT DO NOTHING intentionally preserves deliberate live edits.

insert into public.motorcycle_models
  (slug, brand, model_name, display_name, engine_cc, description, daily_rate_php, is_published)
values
  ('honda-beat', 'Honda', 'Beat', 'Honda Beat', null, null, 499, true),
  ('yamaha-mio-gravis-125cc', 'Yamaha', 'Mio Gravis 125cc', 'Yamaha Mio Gravis 125cc', null, null, 550, true),
  ('honda-click-125cc', 'Honda', 'Click 125cc', 'Honda Click 125cc', null, null, 599, true),
  ('honda-click-160cc', 'Honda', 'Click 160cc', 'Honda Click 160cc', null, null, 700, true),
  ('yamaha-aerox-160cc', 'Yamaha', 'Aerox 160cc', 'Yamaha Aerox 160cc', null, null, 750, true),
  ('honda-pcx-160cc', 'Honda', 'PCX 160cc', 'Honda PCX 160cc', null, null, 800, true),
  ('yamaha-nmax-155cc', 'Yamaha', 'NMAX 155cc', 'Yamaha NMAX 155cc', null, null, 850, true),
  ('honda-adv-160', 'Honda', 'ADV 160', 'Honda ADV 160', null, null, 900, true),
  ('suzuki-v-strom-160', 'Suzuki', 'V-Strom 160', 'Suzuki V-Strom 160', null, null, 950, true),
  ('honda-adv-350', 'Honda', 'ADV 350', 'Honda ADV 350', null, null, 1800, true)
on conflict (slug) do nothing;
