# PayMongo test foundation — disabled, not applied

Migration: `202610130024_paymongo_test_foundation.sql` (requires migrations through 023).

This is the database stage only. No Checkout API, webhook, reconciliation worker, customer option, or ADMIN UI has been enabled. Do not enable the settings row yet. Nothing reads or exposes the secret key in this stage.

The separate `paymongo_test_checkouts` and immutable `paymongo_test_receipts` tables never contribute to cash receipts, balances, revenue, security deposits, or handover eligibility. Existing cash-only receipt and handover guards remain intact. ADMIN-authenticated sessions have read access through existing active-admin authorization; an ADMIN UI still needs to display these as **TEST — no money collected**, separately from rental balances.

Preparation accepts only existing owned, finalized, confirmed test bookings. Pending international bookings must first receive normal administrative confirmation. Existing booking confirmation/availability guards establish the reservation; this migration never creates bookings or confirms them. The preparation RPC locks the booking, derives the PHP amount from its stored server quote, prohibits existing rental payments, and reserves one permanent intent per booking. Offline intent insertion uses the same booking lock. The intent freezes the price, owner, schedule and unit; cancellation remains available. There are intentionally no retry sessions or automatic release/rebooking paths.

Settlement is service-role-only and idempotent by session and payment ID. It checks amount, currency and test mode. Expired deadlines or cancelled/changed bookings record `review_required`; they never revive reservations. Duplicate distinct payments raise an error and require operational investigation. The database RPC does not validate webhook signatures or independently retrieve PayMongo data: those are mandatory in the unfinished trusted server layer.

## Remaining implementation and configuration

1. Manually apply to a disposable Supabase project and run SQL/RLS/runtime tests, including concurrent Checkout/offline payment, retry, mismatched amounts/owners, duplicate session/payment, cancellation and expiration. Static checks alone are not readiness evidence.
2. Build server-only Checkout routes using authenticated Supabase ownership, `PAYMONGO_SECRET_KEY` with mandatory `sk_test_` validation, fixed trusted return URLs and an allowlisted PayMongo redirect host. Reject live-mode responses. Create no second session after an ambiguous timeout; reconcile the first session using durable intent identity. Verify PayMongo's current API/idempotency behavior before choosing the creation/recovery strategy.
3. Configure a separate test webhook signing secret and public HTTPS endpoint. Verify signatures on raw request bytes, timestamp freshness and test-mode event identity; fetch authoritative session/payment state with the test key before invoking settlement. Never settle from a success URL or unverified payload.
4. Implement durable webhook delivery bookkeeping, retry/error monitoring, scheduled reconciliation for missed events and ambiguous session creation, and session expiry/cancellation reconciliation. The 30-minute local deadline does not expire the hosted PayMongo session; late successful payments require review. Store no unneeded PII or secrets in payload logs.
5. Add the disabled-by-default customer payment option and separate ADMIN test status display. Keep test booking handover rules unchanged; simulated gateway receipts do not satisfy cash handover.
6. Run focused integration and concurrency tests before setting readiness flags, then enable only in a test environment. Add an independent server feature flag (default false) and validate webhook/reconciliation configuration on every start. No production migration or activation is authorized by this file.

`paymongo_test_settings` has no application-role write grants. Readiness/activation requires deliberate owner SQL after evidence is recorded. The setting cannot be enabled unless all four readiness flags are true; these flags are an operational gate, not proof that tests actually passed.
