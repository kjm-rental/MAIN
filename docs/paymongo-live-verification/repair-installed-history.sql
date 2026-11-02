-- Reconcile metadata for already-installed, source-matched payment objects.
-- This does not replay migrations, enable payments, or claim provider verification.
begin;
set local lock_timeout='5s';
set local statement_timeout='20s';
select pg_advisory_xact_lock(hashtextextended('kjm-payment-history-repair',0));
do $$
declare matched integer;
begin
  if (select enabled from public.paymongo_live_settings where id) then
    raise exception 'Disable new live checkout creation before history repair';
  end if;
  with expected(schema_name,function_name,body_hash) as (values
    ('public','prepare_paymongo_live_checkout','79d0f3526600efda181d35a6ea22e5fe'),
    ('public','attach_paymongo_live_session','51e389efc356fe961b22f5e7f314f7df'),
    ('public','settle_paymongo_live_checkout','d7afbd8f13e073a88631a52ef1bf1959'),
    ('private','guard_paymongo_live_cash_conflict','78c091dbbc164d59108881f726cdb3cd'),
    ('private','guard_paymongo_live_booking_snapshot','bb0d937f3a1e50a71c47fcfb7fb01e6e'),
    ('public','claim_paymongo_live_creation','6125a44fb2c50e6d321412353a8f53b0'),
    ('public','read_paymongo_live_checkout','36261e331b2fc0f6d3c5bc21b3be4cec'),
    ('public','list_paymongo_live_checkouts','2fe7a99098b888fcba0fcd5e50bdf207'),
    ('public','paymongo_live_event_completed','4f31efc693b181abe1a9905bfb9ca577'),
    ('private','assert_cash_rental_receipt','4ab9a2dbc3f3d551295113010890de23'),
    ('public','paymongo_live_ready','a4ff8b46d01e4088b491f3d759e3c443'),
    ('public','paymongo_live_methods','df1381ab65fc8ffd74834715bcb1f42f'),
    ('private','delivery_qrph_ready','fce182187adc6671fef794a3be3797e6'),
    ('public','get_delivery_options','527a9f4b8c53f9f6a925ac7bae647d73'),
    ('public','admin_save_delivery_settings','b1cf1b17c93e401f82f30b005b561335'),
    ('public','admin_save_delivery_area','f74b3a7151503e61624ca01e5376f26d'),
    ('public','get_delivery_quote','0057901b864240527f3ec0cf4881814c'),
    ('public','submit_guest_booking_request','a92a61dae7ae89a7af7511db9ea5bb87'),
    ('private','guard_service_reschedule','edd62d64eea9c082e8f71d9efb768890'),
    ('private','notification_delivery_details','85114ae41c3f97c4a8b7e25ed50a9f4b'),
    ('public','prepare_paymongo_guest_checkout','22bbae67f5db1df79cbb27b7ea3f8b16'),
    ('public','get_guest_payment_checkout','bc4b79e992206bca972de519a1fe19f1'),
    ('private','capture_qrph_paid','14bab747b368f48cec132790897fcaaf'),
    ('public','admin_save_notification_settings','9c9feb603eb7d702cc0c7c499d109dc7'),
    ('public','note_paymongo_provider_status','0685e58877eb493379cb7c65ae373026'))
  select count(*) into matched from expected e join pg_namespace n on n.nspname=e.schema_name
    join pg_proc p on p.pronamespace=n.oid and p.proname=e.function_name
    where md5(p.prosrc)=e.body_hash and p.proconfig @> array['search_path=""']
      and p.prosecdef=(e.function_name<>'guard_service_reschedule');
  if matched<>25 then raise exception 'Payment function source/security mismatch';end if;
  if (select count(*) from pg_class where relnamespace='public'::regnamespace
      and relname in ('paymongo_live_settings','paymongo_live_checkouts','paymongo_live_receipts','paymongo_live_webhook_events','delivery_settings','delivery_areas','booking_services')
      and relrowsecurity and relforcerowsecurity)<>7 then raise exception 'Payment table RLS mismatch';end if;
  if exists(select 1 from pg_constraint where conrelid in ('public.paymongo_live_settings'::regclass,'public.paymongo_live_checkouts'::regclass,'public.paymongo_live_receipts'::regclass,'public.paymongo_live_webhook_events'::regclass) and not convalidated) then raise exception 'Unvalidated payment constraint';end if;
  if exists(select 1 from supabase_migrations.schema_migrations h join (values
    ('202610130026','paymongo_live_booking_payments'),('202610260037','delivery_collection'),
    ('202610260038','guest_qrph_checkout'),('202610260039','paymongo_status_visibility')) e(version,name)
    on h.version=e.version where h.name is distinct from e.name) then raise exception 'Conflicting migration history';end if;
end $$;
insert into supabase_migrations.schema_migrations(version,name) values
  ('202610130026','paymongo_live_booking_payments'),
  ('202610260037','delivery_collection'),
  ('202610260038','guest_qrph_checkout'),
  ('202610260039','paymongo_status_visibility')
on conflict(version) do nothing;
update public.paymongo_live_settings set migration_verified=true where id and not enabled;
commit;
select enabled,migration_verified,webhook_verified,reconciliation_verified,concurrency_verified from public.paymongo_live_settings;
