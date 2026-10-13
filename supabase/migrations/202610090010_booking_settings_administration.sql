-- KJM booking policy administration. Additive and disabled by default.

alter table public.booking_settings
  add column if not exists public_booking_enabled boolean not null default false,
  add column if not exists partial_day_pricing_policy text
    check (partial_day_pricing_policy in ('charge_full_day', 'prorated', 'not_allowed')),
  add column if not exists pending_expiration_minutes integer
    check (pending_expiration_minutes is null or pending_expiration_minutes > 0),
  add column if not exists philippine_license_policy text,
  add column if not exists international_license_policy text,
  add column if not exists international_manual_review_required boolean not null default true,
  add column if not exists policies_approved_at timestamptz,
  add column if not exists policies_approved_by uuid references auth.users(id) on delete set null;

alter table public.booking_settings
  add constraint booking_settings_public_enablement_complete_check check (
    not public_booking_enabled or (
      operating_hours is not null
      and partial_day_policy is not null
      and partial_day_pricing_policy is not null
      and pending_expiration_minutes is not null
      and jsonb_array_length(accepted_philippine_id_types) > 0
      and length(trim(philippine_license_policy)) > 0
      and length(trim(international_license_policy)) > 0
      and international_manual_review_required
      and international_policy_source_url is not null
      and international_policy_verified_at is not null
      and length(trim(privacy_notice)) > 0
      and length(trim(retention_policy)) > 0
      and policies_approved_at is not null
      and policies_approved_by is not null
    )
  );

grant select (
  public_booking_enabled,
  partial_day_pricing_policy,
  pending_expiration_minutes,
  philippine_license_policy,
  international_license_policy,
  international_manual_review_required,
  policies_approved_at
) on public.booking_settings to anon, authenticated;

comment on column public.booking_settings.public_booking_enabled is
  'Explicit administrator-controlled master switch. Defaults false.';
comment on column public.booking_settings.partial_day_policy is
  'Rental-day calculation: started 24-hour periods or Manila calendar days.';
comment on column public.booking_settings.pending_hold_minutes is
  'Approved inventory hold duration. Null means no configured inventory hold.';
comment on column public.booking_settings.pending_expiration_minutes is
  'Approved pending-request expiry duration. Enforcement requires an operational expiry worker.';
comment on column public.booking_settings.policies_approved_at is
  'Set only when an administrator explicitly saves a complete policy set.';
