# Migration 026 verification — initial report superseded by FINAL_REPORT.md

See [FINAL_REPORT.md](FINAL_REPORT.md) for the completed schema comparison, successful ledger/concurrency/refund/cash tests, and current application/activation conditions. The procedures below remain prepared only.

The exact migration was executed in a transaction on the pinned dedicated staging database and rolled back. No production connection, customer/booking mutation, live provider call or persisted staging schema change occurred. `results.json` records the tested source SHA-256 and 13 passing checks: compilation, four forced-RLS tables, nine service-only SECURITY DEFINER RPCs/empty search paths, disabled readiness, TEST-mode rejection, LIVE provenance constraints, review-only late settlement, identical/different duplicate payments, no financial credit on review, and webhook event identity/body-hash idempotency.

Staging contains core migrations 001–023 plus TEST-only 024/025. This proves compatibility with that core schema, **not** exact parity with today's production function definitions/RLS. Existing staging bookings are test-marked; the successful non-test LIVE receipt → intent → payment event path was not exercised. The rollback-only fixture used an existing synthetic staging booking reference to exercise rejection/review, not a production booking or a real payment.

## Remaining verification blockers

- Obtain a read-only production schema/function/trigger/grant snapshot and compare the affected 018/020/021/023 objects to staging. No claim of current production RLS verification is made.
- Prepare an owner-approved isolated staging fixture appropriate for the non-test successful settlement path. Do not relabel existing real bookings or disable provenance guards. Confirm its financial events reconcile exactly once and preserve the deposit snapshot at 250000 centavos; pricing must come from `quoted_total_php`, never browser amounts. Migration 026 does not modify prices, policy settings or deposit records, but the positive accounting path and approved-policy snapshot still need runtime evidence.
- Run simultaneous prepare/settle/offline-payment, duplicate payment, competing confirmation/reschedule/inventory, cancellation/expiry and delayed webhook tests with that fixture and committed staging schema. The rollback-only schema is invisible to other PostgreSQL sessions, so this run did not pretend to prove concurrency. Prior TEST concurrency results do not establish LIVE correctness.
- Refund/dispute/multiple-payment and interrupted-creation recovery need operator procedures and end-to-end provider verification. Automatic refund or safe cash fallback after an uncertain/expired permanent intent is not implemented. Review receipts deliberately do not credit the normal financial ledger. Required exception handling/alerts are a launch blocker.
- The source mode/signature tests cover TEST/LIVE key binding, raw-body verification, timestamp freshness and duplicate handling. Genuine LIVE webhook delivery, scheduler access and provider response compatibility remain unverified.
- Required server variables are currently missing: `PAYMONGO_LIVE_SECRET_KEY`, `PAYMONGO_LIVE_WEBHOOK_SECRET`, `PAYMONGO_LIVE_RECONCILIATION_SECRET`, production-matching `SUPABASE_SERVICE_ROLE_KEY`, `PAYMONGO_APP_ORIGIN`. `PAYMONGO_LIVE_ENABLED` remains false. QR Ph capability must be verified with the LIVE account; TEST QR Ph capability is insufficient.

## Exact production procedure — execute ONLY after approval and blockers pass

1. Record the approved migration SHA-256, application version, production project identity and current migration history. Verify 023 exists and 026/live tables do not. Review `private.assert_cash_rental_receipt`, existing payment triggers, grants/RLS and booking/deposit settings before proceeding. The migration must not be substituted or rerun silently.
2. Keep LIVE creation disabled in both environment and database. Confirm recovery access, a current Supabase managed backup/PITR entitlement, and complete a restore rehearsal into a separate protected database. Backups contain private data; keep them outside the repo in an owner-controlled encrypted volume. Supabase database backups do not back up storage object contents; migration 026 changes no storage objects.
3. Configure a private `pg_service.conf`/`.pgpass` with mode 0600 (never put a credential-bearing database URL in a command). On the encrypted backup volume, run:

```sh
umask 077
PGSERVICE=kjm_prod_readonly pg_dump --format=custom --file=/SECURE-ENCRYPTED-VOLUME/kjm-pre026.dump
pg_restore --list /SECURE-ENCRYPTED-VOLUME/kjm-pre026.dump
pg_restore --dbname=service=kjm_restore_rehearsal --exit-on-error --no-owner --no-acl /SECURE-ENCRYPTED-VOLUME/kjm-pre026.dump
```

`kjm_restore_rehearsal` must be a separate empty protected database, never production. A readable archive list is not a restore rehearsal; compare expected schema, row counts, constraints and required functions after restore. Capture the exact prior cash-receipt guard definition, trigger definitions and grants in a separate encrypted schema backup. Do not run these commands until the service entries/destination are verified; no backup was performed during this task.

4. Generate and review the atomic deployment bundle with `node scripts/prepare-paymongo-live-deployment.cjs`. It matches the staging evidence hash, checks for a previous/partial application, holds a migration lock, keeps activation false, and writes SQL and history in one transaction. After explicit owner approval:

```sh
PGSERVICE=kjm_prod_approved_migration psql --set=ON_ERROR_STOP=1 --file=docs/paymongo-live-verification/production-apply.sql
```

Use a verified production service entry with migration-owner privileges. A lock timeout or SQL error rolls the entire transaction back when the connection exits; investigate and recheck migration history before any retry. No TEST migrations are dependencies of this production bundle.

5. Verify 026 history and disabled settings; compare original customer/booking/payment counts, prices, inventory, deposit policy and financial totals to the preflight. Verify new RLS/grants, that TEST data cannot settle, and that existing cash-only bookings continue to work. Do not create test receipts in production. Leave all readiness flags and LIVE creation disabled pending separate activation approval.

## Recovery

- Before commit: rely on transaction rollback, confirm 026/live objects are absent and the prior cash guard remains intact. Do not manually delete records to repair a partial run.
- After commit but before activation: turn off the application payment UI/creation flag; keep additive tables/history, inspect issues and deploy a reviewed forward fix. Restore the captured prior cash guard only after proving no LIVE receipts/intents exist and obtaining approval. Do not blindly drop ledger tables.
- After any real money is collected: disable new creation but keep authenticated webhook/reconciliation draining. Reconcile all provider transactions and resolve financial exceptions. Prefer forward repair; blindly restoring an old database loses later transactions/customer records. A production restore/PITR cutover requires explicit approval, a write freeze and provider-to-ledger reconciliation plan.

Reference: [Supabase backups](https://supabase.com/docs/guides/platform/backups), [PostgreSQL restore options](https://www.postgresql.org/docs/current/app-pgrestore.html).
