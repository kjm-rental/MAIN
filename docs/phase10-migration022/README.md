# Phase 10 — disposable migration 022 verification

Migration 022 committed successfully to **uuxjymzrtncrnnkvdpjy only** on 2026-10-11. Verified migrations 001–021 before application and 001–022 afterward. Production **slevojynuumrvgiznmxk was not contacted or modified** during this testing run. No applications deployed, provider requests sent, or projects deleted.

## Deployment

Applied the reviewed migration atomically with its migration-history entry. SHA-256: `b962b9fb4cde2c72345dfec7571c52ce4c56cec5064c08f2c634918b58715917`. Existing customer, booking, model, payment and deposit counts were unchanged immediately after deployment. Source migrations 020–022 and both application environment files remain byte-identical to the preservation baseline. See `deployment.json` and `reconciliation.json`.

## Executed tests

| Check | Result |
| --- | --- |
| Real PostgreSQL integration | 53 assertions passed; 0 failed on final run |
| Effective database grants, RLS and authorization | 19 assertions passed; 0 failed |
| Separate simultaneous PostgreSQL connections | 10 race scenarios; 28 assertions passed; 0 failed |
| KJM MAIN automated tests | 56 tests across 9 files passed |
| KJM ADMIN automated tests | 204 tests across 17 files passed |
| Both application TypeScript, ESLint and production builds | Passed |
| PostgreSQL `plpgsql_check` | Raw command exited 1: 70 cross-table trigger diagnostics; all classified below |

Actual PostgreSQL tests exercised outbox creation from authoritative booking, verification, cash payment, deposit, handover and return events; scheduled reminders and stale-event suppression; duplicate prevention; leases, retries, failed deliveries and manual retry authorization; privacy; RLS; sequence permissions; financial integrity and rollback. Integration fixtures and forced failure constraints were rolled back. Concurrency tests retained only their own explicitly synthetic fixture and financial/audit records in the disposable database.

An initial integration run failed because a JavaScript wall-clock inspection timestamp exceeded PostgreSQL's fixed transaction-start `now()`. The fixture now uses database-relative timestamps; the complete rerun passed. This was a harness correction, with no application or migration change. The initial failure evidence remains in `integration-initial-timing-failure.json`.

## Concurrency and financial integrity

Distinct backend PIDs prove separate connections. Simultaneous identical payments, deposit collections and deposit returns returned the same original record. Overpayments, duplicate distinct-key collections, excess returns and stale worker completions rolled back safely. Four workers claimed distinct notification IDs and leases. Only one concurrent manual retry committed, producing one audit entry. Retries created no additional ledger entries or logical notifications.

Forced notification-generation failure preserved the authoritative payment; repair produced the missing notifications once. Synthetic rental accounting reconciles to 0 centavos over two events; deposit accounting separately reconciles to 0 held centavos over two events.

## Outbox reconciliation

The retained concurrency fixture has 14 synthetic records: 13 pending and 1 simulated sent delivery, with no processing leases and no duplicate `(event_key, channel, recipient_reference)` tuples. The two verification-review rows refer to separate document events. Pending records remain for inspection while delivery is disabled; stale-event eligibility was separately verified. There are zero unresolved generation errors. No real messages or emails were sent.

## Security and database lint

Three notification tables have forced RLS. Anonymous users cannot access them; authenticated customers cannot mutate records or invoke worker RPCs. Direct client and service-role table writes are denied. Worker functions are service-role-only; administrator RPCs freshly enforce active administrator authorization. All 12 new SECURITY DEFINER functions have an empty search path. Private helpers cannot be invoked by client roles. No new sequence was added; effective anonymous/authenticated permissions on the existing financial sequence were denied in actual operations.

Raw `plpgsql_check` reported 70 SQLSTATE 42703 errors, all in the shared `capture_kjm_notification` trigger. It evaluates each table's NEW/OLD record type through branches for the other six tables. Every diagnostic is in a branch guarded by a different `TG_TABLE_NAME`; none concerns that attachment's executable branch. The other 11 functions had no diagnostics. `lint-analysis.json` documents the classification and `lint-results.json` preserves raw output. This is an explained static-tool limitation, not a clean raw lint pass. All seven actual trigger paths passed integration. The diagnostic extension installation was rolled back and is absent afterward.

Customer notification payloads omit identity documents, private URLs, phone numbers, notes and credentials. Verified Auth email is resolved only by the authorized worker. Mock behavior cannot invoke real transports; real provider delivery was deliberately not tested.

## Restrictions verified and remaining work

Telegram and Resend database switches remain false; reminder approval remains false. Public booking remains false, and the read-only Auth settings check confirms anonymous users remain disabled. Neither environment file changed. Production remains on its previously reported migrations 001–019; no production connection was made to reconfirm it in this run.

Real provider delivery, deployed application behavior and authenticated browser verification were not executed as part of this database testing approval. No live delivery readiness is claimed. Synthetic fixture/audit/outbox records remain in the disposable project for review. Local test runners reference temporary PostgreSQL dependencies and guarded connection metadata; credentials are read into memory and are absent from evidence files.

Migration 022 is **ready for separate production deployment review**, with the disclosed lint limitation. Production would require review and separately approved deployment of its missing prerequisite migrations 020 and 021 before 022. Delivery activation requires its own approval and provider checks. No further deployment or activation will occur under this approval.

## Files added in this verification run

Only verification scripts and evidence under `KJM MAIN/docs/phase10-migration022/` were added; no application source or migration SQL was changed:

- `README.md`
- `apply.cjs`, `connection.cjs`, `auth-readonly.cjs`
- `integration.mjs`, `security.cjs`, `concurrency.cjs`, `lint.cjs`, `reconcile.cjs`
- `deployment.json`, `auth-settings.json`
- `integration-results.json`, `integration-initial-timing-failure.json`
- `security-results.json`, `concurrency-results.json`
- `lint-results.json`, `lint-analysis.json`, `reconciliation.json`

Application command logs are `/tmp/kjm-022-{main,admin}-{typecheck,lint,tests,build}.log`; the final MAIN lint including new verification files is `/tmp/kjm-022-main-lint-final.log`. Evidence JSON files contain synthetic identifiers only and no database credentials.
