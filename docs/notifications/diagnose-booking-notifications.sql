-- READ ONLY. Run in MAIN SQL Editor; no migrations or record changes.
-- Does not return names, email addresses, contact numbers, payloads, or identity documents.
with latest as (
 select * from public.bookings where not is_test and submitted_at is not null order by created_at desc limit 1
)
select b.booking_reference,b.status,b.submitted_at is not null as submitted,
 exists(select 1 from public.booking_terms_acceptances t where t.booking_id=b.id) as finalized,
 c.email is not null as contact_email_configured,
 u.email_confirmed_at is not null as account_email_verified,
 lower(btrim(c.email))=lower(btrim(u.email)) as recipient_binding_matches,
 v.customer_type,v.overall_status,
 coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'event',n.event_type,'channel',n.channel,'status',n.status,
 'attempts',n.attempt_count,'error',n.last_error,'delivered_at',n.delivered_at,'provider_recorded',n.provider_reference is not null)
 order by n.created_at) from public.notification_outbox n where n.booking_id=b.id),'[]'::jsonb) as delivery_history
from latest b join public.customers c on c.id=b.customer_id
left join auth.users u on u.id=c.auth_user_id
left join public.customer_verifications v on v.booking_id=b.id;
select resend_enabled,telegram_enabled,reminders_approved,delivery_start_at,enabled_events from public.notification_settings where id;
