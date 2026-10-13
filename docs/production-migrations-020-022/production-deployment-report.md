# KJM production migrations 020–022 — completed

Production project: **slevojynuumrvgiznmxk**. Disposable comparison project: **uuxjymzrtncrnnkvdpjy**.

Migrations 020, 021 and 022 committed successfully on **2026-10-11 at 16:46:04 Asia/Manila**. The owner explicitly accepted the previously disclosed unverified backup-restoration risk and authorized deployment without another restore test.

## Applied SQL

All three migrations ran in order within **one PostgreSQL transaction**, including their migration-history inserts. This is stronger than a combined 020/021 transaction: no insecure 020-only state or partial 022 installation was exposed. No SQL statement was skipped. Existing application tables were locked against concurrent writes during preservation checks and deployment. All pre-commit assertions passed before committing.

| Version | Migration | SHA-256 |
| --- | --- | --- |
| 202610110020 | cash_deposits_and_rental_operations | 1014e63dbedcd818e5abca60f370f490effbd07416951928a673aaf96757e6e2 |
| 202610110021 | deposit_sequence_and_payment_idempotency | 8053be0c90a499a22ead80c9369471ad87822d11552aead16f57b028469e3a06 |
| 202610110022 | transactional_notification_outbox | b962b9fb4cde2c72345dfec7571c52ce4c56cec5064c08f2c634918b58715917 |

Confirmed production history 001–019 before deployment and **001–022 after commit**. Source files, tested disposable migration history and production's stored SQL match exactly. All **25 migrated function definitions** also match the disposable database. Both environment files and migration source files remained unchanged.

## Database and security verification

- **13 deployment assertions passed** before commit.
- **19 actual production security assertions passed**, including SQLSTATE 42501 denials for anonymous/authenticated worker claims, reminder scheduling, notification mutations, and financial sequence access.
- **15 final postflight assertions passed** after commit.
- Seven new deposit/rental/notification tables exist, have forced RLS, and deny direct anonymous access and authenticated mutations. All **31 application tables have RLS enabled**; all seven new tables have policies.
- Notification SECURITY DEFINER functions use an empty search path; worker RPCs are service-role-only, administrator RPCs retain authorization, and private helpers cannot be called by client roles. Direct service-role notification table writes are denied.
- Financial sequence USAGE/SELECT/UPDATE privileges remain denied to anonymous and authenticated roles; authorized owner/service operations retain their intended access.
- Payment, payment-adjustment and deposit idempotency keys have enforced unique indexes. The two corrected payment RPC definitions match the implementations that passed real disposable integration/concurrency tests, including lock-followed-by-key rechecks and financial bounds.
- Actual production calls from an unauthorized authenticated identity failed at administrator authorization before any payment mutation. These checks rolled back. No authorized production payment/deposit mutation or production concurrency fixture was created.
- Notification logical-event uniqueness is enforced. Production has **zero deposit snapshots, zero outbox rows and zero notification-generation errors** immediately after deployment. No historical notifications or fabricated records were generated.

A first postflight harness run encountered SQLSTATE 42601 because it used the reserved word `authorization` as a savepoint name. This was separate from migration execution, after the migrations had successfully committed. Its test transaction rolled back; the savepoint was renamed and the complete rerun passed. Initial evidence is retained in `production-postflight-failure.json`. No migration SQL was changed or retried.

## Existing data reconciliation

All **24 original application tables** matched counts and row fingerprints against the preserved production backup baseline, before deployment, within the transaction afterward, and again after commit. Original columns were compared within the deployment transaction to allow the intended new bookings column without treating that schema addition as a record change.

Key preserved counts: **12 motorcycle models, 36 units, 9 motorcycle media records, 1 administrator and 57 audit records**. Production had **0 customers, 0 bookings and 0 payment records**; these remain zero. Motorcycle prices, inventory contents and existing administrator/financial/audit data are unchanged.

## Disabled features

Fresh SQL and Auth/API checks confirmed:

| Feature | State |
| --- | --- |
| Public booking | Disabled |
| Anonymous authentication | Disabled |
| Cash-deposit policy activation | Disabled |
| Physical ID deposits | Disabled |
| Telegram delivery | Disabled |
| Resend delivery | Disabled |
| Notification reminder approval | Disabled |

Deposit infrastructure and notification outbox RPCs are installed and visible through the production API. Infrastructure installation does not activate policies or real delivery. No messages or emails were sent.

## Application checks executed after migration work began

| Application | TypeScript | ESLint | Automated tests | Production build |
| --- | --- | --- | --- | --- |
| KJM MAIN | Pass | Pass | 56/56, 9 files | Pass |
| KJM ADMIN | Pass | Pass | 204/204, 17 files | Pass |

Both builds used `next build --webpack`. Total: **260 tests passed**, zero failures. Logs: `/tmp/kjm-production-final-{main,admin}-{typecheck,lint,tests,build}.log`.

## Backup and remaining issues

The existing archive is preserved at:

`/Users/mac/KJM-Backups/slevojynuumrvgiznmxk-2026-10-11T08-25-49.523Z-yfXwQ8/production.dump`

Size **1,342,789 bytes**. SHA-256 remains `f9a4cb9291ecb11b178d5ea27186c122989bc6316dd22abb4d3f2d9a804a11c8`. Owner-only permissions remain intact. No backup or project was deleted.

**Remaining recovery limitation:** a full restore is still unverified because the isolated PostgreSQL/Cron environment crashed. This risk was explicitly accepted for this deployment. The logical database archive does not include Storage object bytes, platform configuration/secrets or Vault root-key recovery. Details are in [the historical backup report](backup-and-recovery-report.md).

Migration 022's previously disclosed 70 cross-table static trigger lint diagnostics remain explained in the [disposable verification report](../phase10-migration022/README.md); all executable trigger paths passed real disposable tests. No new security failure was identified by production verification. Real provider delivery and live payment/deposit mutations were not tested in production. No authenticated browser testing was performed for this SQL deployment.

## Evidence and scope

- `production-deployment.json`: atomic commit, exact migration hashes, pre/post counts and 13 assertions.
- `production-security-results.json`: 19 role/grant/RLS assertions.
- `production-postflight.json`: committed schema/history, indexes, fingerprints, flags and 15 assertions.
- `production-auth-settings.json`: final read-only Auth/API results.
- `production-postflight-failure.json`: resolved savepoint harness error.
- `application-verification.json`: application command results and log locations.

Only SQL infrastructure and its migration history were added to production. No websites deployed, prices changed, unrelated records modified, public booking/anonymous Auth enabled, deposit policy activated, or notifications sent. Temporary CLI connection credentials were removed after verification. Work stops here.
