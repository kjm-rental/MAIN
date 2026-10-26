# Checkout redesign and live QRPh readiness — 2026-10-26

## Changes

The existing review now has two compact payment choices, six small Coming Soon badges, concise contact/service information and one shared responsive price summary. The mobile summary appears before acceptance/confirmation. Zero extras/service rows are hidden; an hourly extension is shown as included in rental, with an optional calculation. Rental calculation is unchanged. The displayed online amount is rental + extras + delivery + collection; the refundable cash deposit is separate, read from the existing authoritative quote. Cash checkout shows the combined handover amount. QRPh submit uses “Continue to Secure Payment” and stays disabled unless the existing live readiness/capability gates and all required booking information are satisfied.

An existing live `sk_live_` key was found in MAIN's original `PAYMONGO_SECRET_KEY` variable. The secure configuration now accepts that existing key in explicit live mode without overwriting or duplicating it. A dedicated `PAYMONGO_LIVE_SECRET_KEY`, if supplied, takes precedence. A test key is never accepted in live mode.

A read-only authenticated GET to PayMongo's merchant capability endpoint returned HTTP 200 and `qrph`. This verifies that the configured live credential reports QRPh capability; it does NOT verify hosted session creation, webhook delivery, settlement or production readiness. No provider checkout or payment was created.

Returning customers now request authenticated provider reconciliation through the existing guest-cookie-protected status endpoint; URL redirects/query parameters never prove payment. Friendly labels cover paid, pending, failed, cancelled, expired, unresolved setup and owner review. ADMIN displays receipt/session references and prevents another simple cash payment when an online attempt exists; existing database cash/gateway duplicate guards remain authoritative.

## Database inspection

Read-only requests found the live checkout table, delivery/service tables, delivery options RPC and guest checkout status RPC. `paymongo_live_ready()` returned false. Delivery settings were disabled; cash enabled; QRPh disabled. The service role's inability to read `paymongo_live_settings` directly is intentional; readiness is exposed through its existing protected RPC. No permissions were weakened.

Actual existing filenames:

- `202610130026_paymongo_live_booking_payments.sql` (not `202610260026`)
- `202610260037_delivery_collection.sql`
- `202610260038_guest_qrph_checkout.sql`

Required objects are present; do not rerun these migrations just because QRPh is disabled.

New prepared migration: `202610260039_paymongo_status_visibility.sql`, after 026 and 038. It stores provider-verified reconciliation status and timestamp for ADMIN, with an audit entry on state changes. Only service_role may call the status RPC. It does not modify financial events, booking totals, prices, booking confirmation, receipts or readiness flags. Settled paid/review states cannot be downgraded. It was NOT applied. Before application the existing payment flow still works; ADMIN shows saved settlement state and clearly labels an elapsed checkout as requiring reconciliation instead of inventing a failed/paid state.

## Remaining configuration — MAIN/.env.local

Keep the working `PAYMONGO_SECRET_KEY`; do not replace it with a placeholder. Configure these currently missing values through the existing secure environment:

- `PAYMONGO_MODE=live`
- `PAYMONGO_LIVE_WEBHOOK_SECRET` — the exact signing secret for the live webhook
- `PAYMONGO_LIVE_RECONCILIATION_SECRET` — at least 32 characters for the existing protected scheduler
- `PAYMONGO_APP_ORIGIN` — the actual public HTTPS site origin, no trailing path
- `PAYMONGO_LIVE_ENABLED=true` — only after the verification steps below
- `NEXT_PUBLIC_QRPH_LIVE_VERIFIED=true` — only after verification; mirror this display/activation gate in ADMIN's environment

Restart the existing applications after environment changes. No actual .env.local values were changed by this task. All provider secrets stay server-side; only the boolean public verification gate is client-visible.

## Webhook and activation sequence

1. Review/apply only new migration 039 once, after confirming the existing dependencies. No production SQL was executed here.
2. In PayMongo LIVE webhook configuration, point `checkout_session.payment.paid` to `<PAYMONGO_APP_ORIGIN>/api/paymongo/webhook`. That endpoint must be publicly reachable over HTTPS and running the existing handler; localhost cannot receive PayMongo deliveries directly. Copy that endpoint's LIVE signing secret to `PAYMONGO_LIVE_WEBHOOK_SECRET`. No webhook was created or changed here.
3. Configure the existing authenticated `/api/paymongo/reconcile` scheduler using `PAYMONGO_LIVE_RECONCILIATION_SECRET`. Keep reconciliation and webhook processing available even when new QRPh creation is disabled.
4. Verify actual live hosted-session creation for this merchant, authentic/invalid signatures, amount/currency/mode/reference matching, repeated/delayed webhooks, provider status retrieval, expiration, unresolved creation, cash-vs-online concurrency and duplicate settlement. Use an explicitly owner-authorized acceptance workflow; no real acceptance booking/payment was created here. Test-mode success and automated mocks are not proof of live readiness.
5. Verify that QRPh covers saved rental/services only; the existing cash deposit is excluded. Verify that pending/manual-review bookings wait for their existing confirmation policy, and a paid but unfulfillable reservation is flagged for owner review without automatic revival or refunds.
6. Only after those checks, the authorized operator records the existing LIVE foundation flags (`migration_verified`, `webhook_verified`, `reconciliation_verified`, `concurrency_verified`) and enables that foundation. The read-only inspection here found aggregate readiness false; it did not mark any flag passed. A SQL Editor owner can inspect those five boolean fields in `public.paymongo_live_settings` without reading credentials.
7. Set the two environment activation gates and restart MAIN/ADMIN. Then the owner enables QRPh in ADMIN → Settings → Payment Methods. At least one usable method remains required. Unsupported channels remain disabled.

The existing v1 Hosted Checkout flow is retained. Official documentation describes both v1 and v2, recommends v2 for new integrations, and supports reopening the same active hosted session for payment retries: https://docs.paymongo.com/docs/payment-channels-hosted-checkout. This task does not replace the existing integration or create a second payment system. A fully expired or unresolved KJM checkout still requires reconciliation/owner assistance before any replacement payable attempt; it never creates duplicate bookings to retry.

## Verification limits

Focused UI-rendering, server/payment-state and existing webhook/reconciliation tests are mocked; TypeScript/lint checks do not prove live payment delivery or PostgreSQL runtime behavior. No bookings, payments, deposits, refunds, notification sends, production migrations, deployment, push or new test environment were created.
