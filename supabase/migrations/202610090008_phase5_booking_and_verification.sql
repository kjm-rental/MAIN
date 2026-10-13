-- KJM Phase 5: customer booking requests, identity review, and protected documents.
-- Additive only. This migration does not enable payments or invent business policy.

alter table public.customers
  add column if not exists country_of_residence text,
  add column if not exists customer_type text check (customer_type in ('philippine_resident', 'international_visitor')),
  add column if not exists notes text;

alter table public.bookings
  alter column motorcycle_unit_id drop not null,
  add column if not exists motorcycle_model_id uuid references public.motorcycle_models(id) on delete restrict,
  add column if not exists pricing_daily_rate_php integer check (pricing_daily_rate_php is null or pricing_daily_rate_php >= 0),
  add column if not exists pricing_units integer check (pricing_units is null or pricing_units > 0),
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists handover_at timestamptz,
  add column if not exists handover_by uuid references auth.users(id) on delete set null,
  add column if not exists returned_at timestamptz,
  add column if not exists returned_by uuid references auth.users(id) on delete set null,
  add column if not exists idempotency_key uuid unique;

alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('draft', 'submitted', 'pending', 'confirmed', 'active', 'completed', 'rejected', 'cancelled', 'expired'));
alter table public.booking_status_history drop constraint booking_status_history_old_status_check;
alter table public.booking_status_history drop constraint booking_status_history_new_status_allowed_check;
alter table public.booking_status_history add constraint booking_status_history_old_status_check
  check (old_status is null or old_status in ('draft', 'submitted', 'pending', 'confirmed', 'active', 'completed', 'rejected', 'cancelled', 'expired'));
alter table public.booking_status_history add constraint booking_status_history_new_status_allowed_check
  check (new_status in ('draft', 'submitted', 'pending', 'confirmed', 'active', 'completed', 'rejected', 'cancelled', 'expired'));

create table public.booking_settings (
  id boolean primary key default true check (id),
  timezone text not null default 'Asia/Manila' check (timezone = 'Asia/Manila'),
  operating_hours jsonb,
  partial_day_policy text check (partial_day_policy in ('started_24_hours', 'calendar_day')),
  pending_hold_minutes integer check (pending_hold_minutes is null or pending_hold_minutes > 0),
  accepted_philippine_id_types jsonb not null default '[]'::jsonb check (jsonb_typeof(accepted_philippine_id_types) = 'array'),
  international_policy_source_url text check (international_policy_source_url is null or international_policy_source_url ~ '^https://'),
  international_policy_verified_at date,
  privacy_notice text,
  retention_policy text,
  updated_at timestamptz not null default now()
);
insert into public.booking_settings (id) values (true) on conflict (id) do nothing;

create table public.customer_verifications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_type text not null check (customer_type in ('philippine_resident', 'international_visitor')),
  identity_status text not null default 'not_submitted' check (identity_status in ('not_submitted','submitted','under_review','approved','rejected','resubmission_required')),
  license_status text not null default 'not_submitted' check (license_status in ('not_submitted','submitted','under_review','approved','rejected','resubmission_required')),
  entitlement_status text not null default 'not_submitted' check (entitlement_status in ('not_submitted','submitted','under_review','approved','rejected','resubmission_required')),
  international_status text not null default 'not_submitted' check (international_status in ('not_submitted','submitted','under_review','approved','rejected','resubmission_required','not_applicable')),
  overall_status text not null default 'not_submitted' check (overall_status in ('not_submitted','submitted','under_review','approved','rejected','resubmission_required')),
  license_issuing_country text,
  license_expiration_date date,
  permitted_vehicle_categories text,
  philippines_entry_date date,
  identity_name text,
  license_name text,
  customer_declaration_at timestamptz,
  privacy_consent_at timestamptz,
  reviewer_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.customer_verifications(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  document_kind text not null check (document_kind in ('government_id','passport','drivers_license_front','drivers_license_back','international_driving_permit','supporting_document')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/avif','image/webp','image/jpeg','image/png','application/pdf')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 8388608),
  status text not null default 'submitted' check (status in ('submitted','under_review','approved','rejected','resubmission_required')),
  replaced_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.verification_reviews (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.customer_verifications(id) on delete cascade,
  document_id uuid references public.verification_documents(id) on delete set null,
  review_type text not null check (review_type in ('identity','license','entitlement','international','overall','document_access')),
  result text not null check (result in ('under_review','approved','rejected','resubmission_required','accessed')),
  reason text,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'not_configured' check (delivery_status in ('not_configured','pending','sent','failed')),
  created_at timestamptz not null default now()
);

create index bookings_model_period_idx on public.bookings(motorcycle_model_id, start_at, end_at);
create index customer_verifications_status_idx on public.customer_verifications(overall_status, created_at desc);
create index verification_documents_booking_idx on public.verification_documents(booking_id, created_at);
create index verification_reviews_verification_idx on public.verification_reviews(verification_id, created_at desc);

create trigger booking_settings_set_updated_at before update on public.booking_settings for each row execute function public.set_updated_at();
create trigger customer_verifications_set_updated_at before update on public.customer_verifications for each row execute function public.set_updated_at();

alter table public.booking_settings enable row level security;
alter table public.customer_verifications enable row level security;
alter table public.verification_documents enable row level security;
alter table public.verification_reviews enable row level security;
alter table public.notification_events enable row level security;
alter table public.booking_settings force row level security;
alter table public.customer_verifications force row level security;
alter table public.verification_documents force row level security;
alter table public.verification_reviews force row level security;
alter table public.notification_events force row level security;

revoke all on public.booking_settings, public.customer_verifications,
  public.verification_documents, public.verification_reviews,
  public.notification_events from anon, authenticated;

grant select (timezone, operating_hours, partial_day_policy, accepted_philippine_id_types,
  international_policy_source_url, international_policy_verified_at, privacy_notice)
on public.booking_settings to anon, authenticated;
create policy booking_settings_public_read on public.booking_settings for select to anon, authenticated using (true);

grant select, insert, update on public.customers to authenticated;
create policy customers_self_all on public.customers for all to authenticated
using (auth_user_id = (select auth.uid())) with check (auth_user_id = (select auth.uid()));
grant select on public.bookings to authenticated;
create policy bookings_customer_read on public.bookings for select to authenticated
using (exists (select 1 from public.customers c where c.id = customer_id and c.auth_user_id = (select auth.uid())));
grant select on public.customer_verifications to authenticated;
create policy customer_verifications_owner_read on public.customer_verifications for select to authenticated
using (exists (select 1 from public.customers c where c.id = customer_id and c.auth_user_id = (select auth.uid())));
grant select, insert on public.verification_documents to authenticated;
create policy verification_documents_owner_read on public.verification_documents for select to authenticated using (owner_user_id = (select auth.uid()));
create policy verification_documents_owner_insert on public.verification_documents for insert to authenticated
with check (owner_user_id = (select auth.uid()) and exists (
  select 1 from public.bookings b join public.customers c on c.id = b.customer_id
  where b.id = booking_id and c.auth_user_id = (select auth.uid())
));

grant select, insert, update, delete on public.booking_settings, public.customer_verifications,
  public.verification_documents, public.verification_reviews, public.notification_events to authenticated;
create policy booking_settings_admin_all on public.booking_settings for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create policy customer_verifications_admin_all on public.customer_verifications for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create policy verification_documents_admin_all on public.verification_documents for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create policy verification_reviews_admin_all on public.verification_reviews for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));
create policy notification_events_admin_all on public.notification_events for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('identity-verification', 'identity-verification', false, 8388608,
  array['image/avif','image/webp','image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;

create policy identity_documents_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'identity-verification' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy identity_documents_owner_read on storage.objects for select to authenticated
using (bucket_id = 'identity-verification' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy identity_documents_admin_read on storage.objects for select to authenticated
using (bucket_id = 'identity-verification' and (select private.is_active_admin()));
create policy identity_documents_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'identity-verification' and (select private.is_active_admin()));

create or replace function public.check_model_availability(p_model_id uuid,p_start_at timestamptz,p_end_at timestamptz)
returns integer language sql stable security definer set search_path='' as $$
  select count(*)::integer from public.motorcycle_units u
  where p_end_at > p_start_at and u.motorcycle_model_id=p_model_id and u.status='available' and u.archived_at is null
    and exists(select 1 from public.motorcycle_models m where m.id=p_model_id and m.is_published and m.archived_at is null)
    and not exists(select 1 from public.bookings b where b.motorcycle_unit_id=u.id and b.status in ('pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)') && tstzrange(p_start_at,p_end_at,'[)'))
    and not exists(select 1 from public.motorcycle_unavailability x where x.motorcycle_unit_id=u.id and tstzrange(x.start_at,x.end_at,'[)') && tstzrange(p_start_at,p_end_at,'[)'));
$$;
revoke all on function public.check_model_availability(uuid,timestamptz,timestamptz) from public;
grant execute on function public.check_model_availability(uuid,timestamptz,timestamptz) to anon,authenticated;

create or replace function public.submit_booking_request(
  p_idempotency_key uuid, p_model_id uuid, p_start_at timestamptz, p_end_at timestamptz,
  p_full_name text, p_email text, p_phone text, p_country text, p_customer_type text,
  p_identity_name text, p_license_name text, p_license_country text,
  p_license_expiration date, p_vehicle_categories text, p_entry_date date,
  p_privacy_consent boolean, p_declaration boolean
) returns table (booking_id uuid, booking_reference text, verification_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_model public.motorcycle_models%rowtype;
  v_customer_id uuid; v_booking_id uuid; v_verification_id uuid; v_reference text;
  v_policy text; v_units integer; v_available integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not p_privacy_consent or not p_declaration then raise exception 'Required declarations are missing'; end if;
  if p_start_at <= now() or p_end_at <= p_start_at then raise exception 'Invalid rental period'; end if;
  select partial_day_policy into v_policy from public.booking_settings where id = true;
  if v_policy is null then raise exception 'Booking pricing policy is not configured'; end if;
  select * into v_model from public.motorcycle_models where id = p_model_id and is_published and archived_at is null;
  if not found then raise exception 'Motorcycle is unavailable'; end if;
  if v_policy = 'started_24_hours' then v_units := greatest(1, ceil(extract(epoch from (p_end_at-p_start_at))/86400)::integer);
  else v_units := greatest(1, (p_end_at at time zone 'Asia/Manila')::date - (p_start_at at time zone 'Asia/Manila')::date + 1); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_model_id::text, 0));
  select count(*) into v_available from public.motorcycle_units u
  where u.motorcycle_model_id=p_model_id and u.status='available' and u.archived_at is null
    and not exists (select 1 from public.bookings b where b.motorcycle_unit_id=u.id and b.status in ('pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)') && tstzrange(p_start_at,p_end_at,'[)'))
    and not exists (select 1 from public.motorcycle_unavailability x where x.motorcycle_unit_id=u.id and tstzrange(x.start_at,x.end_at,'[)') && tstzrange(p_start_at,p_end_at,'[)'));
  if v_available = 0 then raise exception 'No verified physical unit is available'; end if;
  insert into public.customers (auth_user_id,full_name,email,phone,country_of_residence,customer_type)
  values(v_user,trim(p_full_name),lower(trim(p_email)),trim(p_phone),trim(p_country),p_customer_type)
  on conflict(auth_user_id) do update set full_name=excluded.full_name,email=excluded.email,phone=excluded.phone,country_of_residence=excluded.country_of_residence,customer_type=excluded.customer_type,updated_at=now()
  returning id into v_customer_id;
  v_reference := 'KJM-' || to_char(now() at time zone 'Asia/Manila','YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.bookings (booking_reference,customer_id,motorcycle_model_id,start_at,end_at,status,quoted_total_php,pricing_daily_rate_php,pricing_units,submitted_at,idempotency_key)
  values(v_reference,v_customer_id,p_model_id,p_start_at,p_end_at,'submitted',v_model.daily_rate_php*v_units,v_model.daily_rate_php,v_units,now(),p_idempotency_key)
  on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning id, public.bookings.booking_reference into v_booking_id,v_reference;
  insert into public.customer_verifications (booking_id,customer_id,customer_type,identity_status,license_status,entitlement_status,international_status,overall_status,license_issuing_country,license_expiration_date,permitted_vehicle_categories,philippines_entry_date,identity_name,license_name,customer_declaration_at,privacy_consent_at)
  values(v_booking_id,v_customer_id,p_customer_type,'submitted','submitted','under_review',case when p_customer_type='international_visitor' then 'under_review' else 'not_applicable' end,'submitted',p_license_country,p_license_expiration,p_vehicle_categories,p_entry_date,trim(p_identity_name),trim(p_license_name),now(),now())
  on conflict(booking_id) do update set booking_id=excluded.booking_id returning id into v_verification_id;
  insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(v_booking_id,null,'submitted',v_user) on conflict do nothing;
  insert into public.notification_events(booking_id,event_type) values(v_booking_id,'booking_request_created');
  return query select v_booking_id,v_reference,v_verification_id;
end; $$;

revoke all on function public.submit_booking_request(uuid,uuid,timestamptz,timestamptz,text,text,text,text,text,text,text,text,date,text,date,boolean,boolean) from public, anon;
grant execute on function public.submit_booking_request(uuid,uuid,timestamptz,timestamptz,text,text,text,text,text,text,text,text,date,text,date,boolean,boolean) to authenticated;

create or replace function public.admin_review_verification(p_verification_id uuid, p_review_type text, p_result text, p_reason text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.customer_verifications%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
  if p_review_type not in ('identity','license','entitlement','international') or p_result not in ('under_review','approved','rejected','resubmission_required') then raise exception 'Invalid review transition'; end if;
  execute format('update public.customer_verifications set %I=$1, reviewer_notes=$2, reviewed_by=$3, reviewed_at=now() where id=$4', p_review_type || '_status') using p_result,p_reason,auth.uid(),p_verification_id;
  select * into v from public.customer_verifications where id=p_verification_id;
  update public.customer_verifications set overall_status=case
    when v.identity_status='approved' and v.license_status='approved' and v.entitlement_status='approved' and v.international_status in ('approved','not_applicable') then 'approved'
    when p_result='rejected' then 'rejected' when p_result='resubmission_required' then 'resubmission_required' else 'under_review' end
  where id=p_verification_id;
  insert into public.verification_reviews(verification_id,review_type,result,reason,reviewer_user_id) values(p_verification_id,p_review_type,p_result,p_reason,auth.uid());
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values(auth.uid(),'verification.reviewed','customer_verification',p_verification_id,jsonb_build_object('review_type',p_review_type,'result',p_result));
end; $$;

create or replace function public.admin_confirm_booking(p_booking_id uuid, p_unit_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v public.bookings%rowtype; v_verification text;
begin
  if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
  select * into v from public.bookings where id=p_booking_id for update;
  if v.status not in ('submitted','pending') then raise exception 'Booking cannot be confirmed from its current status'; end if;
  select overall_status into v_verification from public.customer_verifications where booking_id=p_booking_id;
  if v_verification <> 'approved' then raise exception 'All required verification checks must be approved'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_unit_id::text,0));
  if not exists(select 1 from public.motorcycle_units where id=p_unit_id and motorcycle_model_id=v.motorcycle_model_id and status='available' and archived_at is null) then raise exception 'Selected unit is unavailable'; end if;
  if exists(select 1 from public.bookings b where b.motorcycle_unit_id=p_unit_id and b.id<>p_booking_id and b.status in ('pending','confirmed','active') and tstzrange(b.start_at,b.end_at,'[)') && tstzrange(v.start_at,v.end_at,'[)'))
    or exists(select 1 from public.motorcycle_unavailability x where x.motorcycle_unit_id=p_unit_id and tstzrange(x.start_at,x.end_at,'[)') && tstzrange(v.start_at,v.end_at,'[)')) then raise exception 'Selected unit conflicts with another booking or maintenance block'; end if;
  update public.bookings set motorcycle_unit_id=p_unit_id,status='confirmed',approved_by=auth.uid() where id=p_booking_id;
  insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(p_booking_id,v.status,'confirmed',auth.uid());
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'booking.confirmed','booking',p_booking_id);
  insert into public.notification_events(booking_id,event_type) values(p_booking_id,'booking_approved');
end; $$;

create or replace function public.admin_transition_booking(p_booking_id uuid,p_new_status text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.bookings%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Administrator access required'; end if;
  select * into v from public.bookings where id=p_booking_id for update;
  if not ((v.status in ('submitted','pending') and p_new_status in ('rejected','cancelled')) or (v.status='confirmed' and p_new_status in ('active','cancelled')) or (v.status='active' and p_new_status='completed')) then raise exception 'Invalid booking status transition'; end if;
  if p_new_status='active' and (v.motorcycle_unit_id is null or not exists(select 1 from public.customer_verifications where booking_id=p_booking_id and overall_status='approved')) then raise exception 'Verified customer and assigned unit required for handover'; end if;
  update public.bookings set status=p_new_status,handover_at=case when p_new_status='active' then now() else handover_at end,handover_by=case when p_new_status='active' then auth.uid() else handover_by end,returned_at=case when p_new_status='completed' then now() else returned_at end,returned_by=case when p_new_status='completed' then auth.uid() else returned_by end where id=p_booking_id;
  insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(p_booking_id,v.status,p_new_status,auth.uid());
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id) values(auth.uid(),'booking.'||p_new_status,'booking',p_booking_id);
end; $$;

revoke all on function public.admin_review_verification(uuid,text,text,text), public.admin_confirm_booking(uuid,uuid), public.admin_transition_booking(uuid,text) from public,anon;
grant execute on function public.admin_review_verification(uuid,text,text,text), public.admin_confirm_booking(uuid,uuid), public.admin_transition_booking(uuid,text) to authenticated;

comment on table public.booking_settings is 'Business-owned policies. Public booking remains disabled until required values are configured.';
comment on table public.verification_documents is 'Private identity documents; never expose through public URLs or general exports.';
