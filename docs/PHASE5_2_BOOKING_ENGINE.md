# Phase 5.2 — Booking engine finalization

## State machine

The supported request path is `submitted → confirmed → active → completed`. A submitted request may instead become `rejected`, `cancelled`, or `expired`; a confirmed request may be cancelled. Terminal rejected, cancelled, expired, and completed records cannot be handed over or reconfirmed. Every status transition writes `booking_status_history`; administrator and scheduled changes also create audit evidence.

## Server-controlled policy enforcement

`get_booking_quote` and `submit_booking_request` read the approved `booking_settings` row. They reject requests while the public master switch is off, outside an enabled Manila weekday/window, or under an unsupported/ambiguous pricing combination. Quotes use integer pesos. Submitted bookings store the daily-rate, pricing-unit, and total snapshots; browser values are never authoritative.

Started-24-hour mode supports full-started-day, exact-day-only, and integer-peso prorated calculation. Calendar-day mode supports full calendar days and matching-time whole days. Prorated calendar-day billing is deliberately blocked because no proration basis has been approved.

## Expiration and holds

Each request receives a server-generated `expires_at` based on the configured pending duration. Optional holds reserve one physical unit and have their own shorter server timestamp. An exclusion constraint prevents overlapping active holds for a unit. Submission, confirmation, expiration, and rescheduling use row/advisory locks and recheck bookings, active holds, maintenance, unit status, and archive status.

`expire_pending_bookings` locks eligible submitted/pending rows with `FOR UPDATE SKIP LOCKED`, moves only those states to expired, releases their holds, and records history/audit events. Supabase Cron is prepared to call it once per minute. Repeated calls are idempotent. Confirmation locks the booking first, so confirmation and expiration cannot both win.

## Verification gate

Confirmation requires identity, licence, driving entitlement, international eligibility (or not-applicable), and overall statuses to be approved. It also checks licence expiry and requires a licence image plus the applicable government-ID/passport record. Uploaded documents remain in the private bucket; upload alone is never treated as authenticity.

## Rescheduling and extensions

Only confirmed and active bookings can be rescheduled. Active pickup time cannot be changed. The trusted function recalculates price, locks the physical unit, and rejects overlaps with bookings, holds, or maintenance. The existing booking exclusion constraint remains the final database backstop.

## Readiness and activation

Business configuration and technical evidence are distinct. `booking_readiness_checks` starts with every check false. Neither saving settings nor applying the migration marks a test as passed. A database trigger prevents enabling public booking until all checks are passed by an authorized administrator.

Before activation, execute controlled tests in a disposable Supabase project for submission, retry idempotency, competing holds, expiration/confirmation races, operating hours, every approved pricing combination, verification denial, rescheduling, maintenance conflicts, document isolation, cancellation, handover, return, and customer status synchronization.

## Deployment

Migration `202610090011_booking_engine_finalization.sql` must be reviewed and explicitly approved before production push. Applying it creates and schedules the expiration worker but does not enable public booking. Confirm that Supabase Cron/`pg_cron` is available in the target project and inspect job execution logs after deployment.
