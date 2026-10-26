-- Apply only AFTER 031 is verified in intended MAIN project. No provider calls.
-- Old pending events are retained but held by the delivery-start boundary.
begin;
do $$ begin
 if to_regprocedure('public.notification_runtime_status()') is null then raise exception 'Migration 031 required'; end if;
end $$;
update public.notification_settings set resend_enabled=true,reminders_approved=true,
 delivery_start_at=coalesce(delivery_start_at,now()),updated_at=now(),
 enabled_events=array['booking_requested','booking_approved','booking_cancelled','booking_modified',
 'documents_received','document_checks_passed','verification_action','verification_manual_review',
 'verification_approved','verification_rejected','pickup_instructions','pickup_reminder','handover',
 'return_reminder','rental_completed','deposit_returned','review_request',
 'admin_booking_requested','admin_booking_cancelled','admin_booking_modified','admin_verification_review',
 'admin_manual_review','admin_pickup_reminder','admin_return_reminder','admin_overdue']
where id;
commit;
