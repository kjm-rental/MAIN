-- Read/write verification is wholly rolled back; creates no bookings or messages.
begin;
do $$
declare
  block_id uuid; return_block uuid; original_booking uuid;
  starts timestamptz:='2099-11-10 23:17+08';
  ends timestamptz:='2099-11-11 02:43+08';
  hours jsonb; hit boolean; public_count integer;
begin
  perform set_config('request.jwt.claim.sub',(select auth_user_id::text from public.admin_users where is_active limit 1),true);
  if auth.uid() is null then raise exception 'No active administrator available'; end if;
  select operating_hours into hours from public.booking_settings where id=true;
  -- Overnight, arbitrary minutes and both ends of a 24-hour period are allowed.
  perform private.assert_booking_period_allowed(starts,starts+interval '24 hours',hours);
  perform private.assert_booking_period_allowed(ends,ends+interval '24 hours',hours);
  block_id:=public.admin_add_booking_time_block(starts,ends,'pickup','Rollback verification: private note');
  select count(*) into public_count from public.get_booking_time_blocks(starts,ends);
  if public_count<>1 then raise exception 'Public block query did not return expected interval'; end if;
  hit:=false;
  begin perform private.assert_booking_period_allowed(starts,starts+interval '24 hours',hours);
  exception when raise_exception then
    if SQLERRM not like 'Pickup time is unavailable%' then raise; end if; hit:=true;
  end;
  if not hit then raise exception 'Blocked pickup was allowed'; end if;
  -- A return-only endpoint and a rental spanning a closure remain available.
  perform private.assert_booking_period_allowed(starts-interval '24 hours',starts,hours);
  perform private.assert_booking_period_allowed(starts-interval '24 hours',ends+interval '1 minute',hours);
  perform private.assert_booking_period_allowed(ends,ends+interval '24 hours',hours);
  -- Before INSERT/UPDATE guard also rejects a blocked final write.
  select id into original_booking from public.bookings limit 1;
  if original_booking is null then raise exception 'Existing booking needed for rollback write-guard verification'; end if;
  hit:=false;
  begin update public.bookings set start_at=starts,end_at=starts+interval '24 hours' where id=original_booking;
  exception when raise_exception then
    if SQLERRM not like 'Pickup time is unavailable%' then raise; end if; hit:=true;
  end;
  if not hit then raise exception 'Booking write guard was bypassed'; end if;
  perform public.admin_cancel_booking_time_block(block_id);
  perform private.assert_booking_period_allowed(starts,starts+interval '24 hours',hours);
  return_block:=public.admin_add_booking_time_block(starts,ends,'return','Rollback verification');
  hit:=false;
  begin perform private.assert_booking_period_allowed(starts-interval '24 hours',starts,hours);
  exception when raise_exception then
    if SQLERRM not like 'Return time is unavailable%' then raise; end if; hit:=true;
  end;
  if not hit then raise exception 'Blocked return was allowed'; end if;
  perform private.assert_booking_period_allowed(starts,starts+interval '24 hours',hours);
  perform public.admin_cancel_booking_time_block(return_block);
  block_id:=public.admin_add_booking_time_block(starts,ends,'both','Rollback verification');
  hit:=false;
  begin perform private.assert_booking_time_blocks(starts,ends+interval '24 hours');
  exception when raise_exception then hit:=true; end;
  if not hit then raise exception 'Combined pickup block failed'; end if;
  hit:=false;
  begin perform private.assert_booking_time_blocks(starts-interval '24 hours',starts);
  exception when raise_exception then hit:=true; end;
  if not hit then raise exception 'Combined return block failed'; end if;
  perform public.admin_cancel_booking_time_block(block_id);
  if exists(select 1 from public.get_booking_time_blocks(starts,ends)) then raise exception 'Removed blocks are still public'; end if;
end;$$;
rollback;
select 'Passed: overnight exact times, scope, boundaries, spanning rentals, final write guard, removal. All test changes rolled back.' as verification;
