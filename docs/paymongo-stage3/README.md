# Stage 3 — SQL applied to verified dedicated TEST

The existing pinned disposable-project connection was used, not the application environment. Production was never contacted. Migrations through 023 were already present; only 024 and 025 were applied in order, atomically with migration-history entries. No additional dependency SQL was needed. See `deployment.json` for hashes and unchanged original customer/booking/cash-record counts.

Database checks passed: four forced-RLS tables, seven server-only SECURITY DEFINER RPCs with empty search paths, no anonymous table reads/direct service ledger writes, disabled creation gate, expired-reservation refusal, correct-owner enforcement, locked server pricing, identical preparation retries, duplicate-key rejection, single irreversible creation claim, live/wrong-amount rejection, immutable booking snapshot and receipts, successful idempotent settlement, different-payment rejection, and late-payment review. Preparation/settlement checks used an existing explicitly synthetic fixture and rolled back all temporary terms, readiness settings, timestamp changes and receipts. Initial test-harness failures were corrected for historic expiry and the required deposit snapshot; no payment safeguard was bypassed.

Separate simultaneous PostgreSQL backends verified one receipt for duplicate settlement and exactly one winning overlapping inventory hold (other transaction rejected with 23P01). These are database ledger/inventory-constraint tests, not an end-to-end concurrent customer booking submission or actual PayMongo transaction. Concurrency fixtures were newly inserted synthetic bookings/deposit snapshots/intents/receipts and retained for audit, with no deletions. Some focused retries retained additional synthetic fixtures; the final counts are in `postflight.json`. Their holds expire after 30 minutes and use distant future test dates. Existing real/cash payment records remain unchanged.

The final concurrency evidence is `database-tests.json`. The rollback-only safeguard assertions are in `database-tests.cjs` and their successful execution was recorded in the task output before the independent concurrency fixture correction. The script depends on the existing dedicated-test connection and installed temporary PostgreSQL driver; no new package was installed. It can run only concurrency via `PAYMONGO_CONCURRENCY_ONLY=1`.

## Remaining blockers to actual Checkout testing

- KJM MAIN `.env.local` currently points to the documented **live Supabase project**. Configure a separate test app environment with the dedicated test URL and matching keys; do not enable PayMongo against the current application environment.
- `PAYMONGO_SECRET_KEY` is present and has the test prefix. Missing: `PAYMONGO_WEBHOOK_SECRET`, `PAYMONGO_RECONCILIATION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMONGO_APP_ORIGIN`.
- Configure an HTTPS test webhook for `checkout_session.payment.paid`, the cursor-based reconciliation scheduler and operational alerts.
- Provider response compatibility, real signed test delivery, interrupted creation recovery, cancellation/expiry races against actual PayMongo, and end-to-end customer concurrent booking tests remain unverified.
- Customer payment UI and ADMIN test-status display remain pending from earlier stages.

Both creation gates remain disabled; all readiness flags are false. Database checks alone do not authorize activation. No keys were exposed or environment files changed, no customer data was deleted/reset, and no build, commit, push or deployment occurred.
