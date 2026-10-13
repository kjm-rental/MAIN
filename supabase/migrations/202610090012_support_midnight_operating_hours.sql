-- Treat 00:00 closing as midnight at the end of the configured business day.
-- This replaces only the trusted operating-hours validator.

create or replace function private.assert_booking_period_allowed(
  p_start_at timestamptz, p_end_at timestamptz, p_operating_hours jsonb
) returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_start timestamp := p_start_at at time zone 'Asia/Manila';
  v_end timestamp := p_end_at at time zone 'Asia/Manila';
  v_start_day jsonb; v_start_previous_day jsonb;
  v_end_day jsonb; v_end_previous_day jsonb;
  v_start_allowed boolean; v_end_allowed boolean;
begin
  if p_end_at <= p_start_at then raise exception 'Return must be after pickup'; end if;
  if p_operating_hours is null then raise exception 'Operating hours are not configured'; end if;

  v_start_day := p_operating_hours -> lower(to_char(v_start, 'FMDay'));
  v_start_previous_day := p_operating_hours -> lower(to_char(v_start - interval '1 day', 'FMDay'));
  v_end_day := p_operating_hours -> lower(to_char(v_end, 'FMDay'));
  v_end_previous_day := p_operating_hours -> lower(to_char(v_end - interval '1 day', 'FMDay'));

  v_start_allowed := (
    coalesce((v_start_day ->> 'enabled')::boolean, false)
    and v_start::time >= (v_start_day ->> 'pickupOpen')::time
    and (
      (v_start_day ->> 'pickupClose') = '00:00'
      or v_start::time <= (v_start_day ->> 'pickupClose')::time
    )
  ) or (
    v_start::time = time '00:00'
    and coalesce((v_start_previous_day ->> 'enabled')::boolean, false)
    and (v_start_previous_day ->> 'pickupClose') = '00:00'
  );

  v_end_allowed := (
    coalesce((v_end_day ->> 'enabled')::boolean, false)
    and v_end::time >= (v_end_day ->> 'returnOpen')::time
    and (
      (v_end_day ->> 'returnClose') = '00:00'
      or v_end::time <= (v_end_day ->> 'returnClose')::time
    )
  ) or (
    v_end::time = time '00:00'
    and coalesce((v_end_previous_day ->> 'enabled')::boolean, false)
    and (v_end_previous_day ->> 'returnClose') = '00:00'
  );

  if not v_start_allowed then raise exception 'Pickup is outside operating hours or on a closed day'; end if;
  if not v_end_allowed then raise exception 'Return is outside operating hours or on a closed day'; end if;
end; $$;

revoke all on function private.assert_booking_period_allowed(timestamptz,timestamptz,jsonb)
from public, anon, authenticated;
