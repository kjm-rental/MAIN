# Migration 020 disposable deployment and testing report

**Not ready for production approval.** Migration 020 was applied only to `uuxjymzrtncrnnkvdpjy`. Production `slevojynuumrvgiznmxk` and production environment files were not modified. Testing stopped when an additional sequence-permission audit found a security concern, as the owner instructed. No corrective database changes or production deployment were performed.

## Deployment

The [preflight](preflight.json) verified the pinned disposable project reference, exactly migrations 001–019 applied, and exactly 020 pending. The reviewed SQL contained no DROP TABLE/COLUMN/SCHEMA, TRUNCATE or DELETE statements and did not change public booking, Auth, existing prices or booking durations. The table/function review confirmed forced RLS, active-admin checks, empty SECURITY DEFINER search paths, immutable financial data and revoked direct ledger writes.

Migration 020 was applied atomically with its migration-history entry. SHA-256: `1014e63dbedcd818e5abca60f370f490effbd07416951928a673aaf96757e6e2`. [Deployment evidence](deployment.json). Immediately before and after application, existing record counts were identical: 25 customers, 50 bookings, 50 motorcycle models, 116 units and 24 payment events. Both deposit options defaulted to disabled; cash amount was NULL, accepted ID types empty and legal approval NULL.

Existing disposable configuration stayed unchanged: public booking false, 30-minute hold, **60-minute pending expiry**, Asia/Manila. The 24-hour expiry used by acceptance tests was only a rolled-back synthetic fixture; it is not a claim about the disposable project's live configuration. No anonymous Auth configuration was changed.

## Database lint

Actual PostgreSQL `plpgsql_check` was run on migration 020's PL/pgSQL functions and trigger contexts, with security warnings enabled. **Zero errors and zero warnings.** SQL-language definitions were validated by PostgreSQL when created. All 11 added function definitions were inspected for pinned search paths and grants. Four new tables have forced RLS and no direct anonymous/authenticated INSERT/UPDATE/DELETE grants. [Lint evidence](database-lint.json).

The diagnostic extension was installed inside a transaction and rolled back; it is not retained. These lint checks do not certify all ACLs: the later sequence audit exposed the permission gap below.

## Actual PostgreSQL integration tests

**80 passed, zero failed** on the committed 020 schema. [Individual results](integration-results.json). Synthetic fixture records and temporary policy approvals were rolled back; migration 020 remains installed.

Coverage includes approved cash configuration, immutable quoted requirements, stale-policy rejection, idempotent request/event retries, private-document/verification approval guards, pickup without cash/deposit rejection, actual inspection timestamps, return inspection/odometer, rental completion, cash return, approved partial return, excess return prevention, rental/deposit accounting separation, unresolved liabilities, cancellation, pending/hold expiration, rescheduling, ordinary/suspended-user authorization and RLS privacy. No model-specific deposit amounts were implemented; the policy provides a default amount only.

The ID workflow was exercised only with synthetic policy/document fixtures inside the rollback transaction. No real physical ID was retained and no persistent legally approved ID policy was activated. ID defaults are still disabled.

## Concurrency results and failures

Separate connections opened overlapping PostgreSQL transactions. Distinct backend PIDs were recorded, rather than simulating concurrency with sequential calls.

Confirmed before the security halt:

- Concurrent v3 identical requests returned one booking, one deposit snapshot and one hold.
- Two customers competing for the last physical unit/extra produced exactly one committed request and one rolled-back request.
- Unpaid pickup rolled back without leaving an inspection.
- **Full-balance rental-payment retry failed:** one receipt committed; the simultaneous identical retry was rejected with `Payment exceeds the outstanding balance`. It did not return the original intent. No duplicate receipt or excess payment was created.

[Completed partial-run evidence](concurrency-payment-retry-finding.json) includes the separate backend PIDs and exact database outcomes. An earlier fixture setup collided with the integration suite's existing inventory lock and returned `Inventory is busy`; that setup transaction rolled back. The suites were then run sequentially. This was a test scheduling issue, not an inventory protection defect.

A further run continued the new deposit concurrency scenarios but was terminated when the sequence ACL concern was discovered. It did not produce a completed final suite verdict. Do **not** treat its committed intermediate data as a passed concurrency suite. Deposit collection/return retry races, excess combined refunds, cancellation refunds, handover races and expiry/confirmation races require a complete rerun after the security correction. Full rental-refund idempotency also remains uncertified; its existing RPC uses a similar pre-lock lookup pattern.

## Security finding — sequence permissions

The additional catalog audit found:

- `public.security_deposit_events_sequence_seq`: anonymous role has USAGE and UPDATE.
- The authenticated role also has UPDATE.

[Evidence](sequence-permissions.json), confirmed again in [postflight](postflight.json). These inherited privileges permit sequence manipulation by those database roles, despite the intended read-only client ledger access. Direct deposit-event mutations remain denied and immutable row protections are intact. No unauthorized financial row modification or REST/API exploit was demonstrated. Nevertheless, sequence ordering/availability permissions are broader than intended and block production approval.

The initial table/function review missed this sequence ACL. It was discovered after migration application; testing was stopped immediately when found. The in-flight synthetic process was terminated, uncommitted work rolled back on connection closure, and disabled policy defaults were restored through the authorized admin RPC. [Cleanup evidence](cleanup.json).

A proposed correction for review is to revoke ALL privileges on the new sequence from PUBLIC, anon and authenticated; SECURITY DEFINER writers retain owner access. **That correction has not been applied.** Migration 020's reviewed/applied checksum remains unchanged. A corrective migration and complete permission/concurrency regression tests are needed before production review.

## Existing financial RPC defect

`admin_record_offline_payment` in migration 018 checks its idempotency key **before** acquiring the booking row lock. Two simultaneous calls can both miss the key. Once the first records the full balance, the second wakes and fails the outstanding-balance check before reaching the unique-key recovery handler. This explains why partial-payment retry tests previously passed while the new full-balance test fails.

Required correction: recheck the existing idempotency key and fingerprint after taking the serialization lock and before checking the remaining balance. Review the adjustment RPC for the same ordering issue. No working business logic or financial records were changed during this testing-only task.

## Financial reconciliation and retained fixtures

The rollback suite reconciled rental receipts separately from refundable deposits throughout collection, partial/full return and explicit unresolved completion. A deposit return does not alter rental revenue. Duplicate/excess operations rejected in the verified scenarios left no new ledger entries.

The [post-stop accounting snapshot](postflight.json) contains only explicitly synthetic concurrency fixtures. It includes a completed synthetic rental with net rental cash and held deposit both zero after its recorded movements, and a cancelled synthetic booking `KJM-20261011-68214507` with **12,345 centavos still held**. That liability was preserved when testing stopped; it was not silently refunded, erased or counted as rental revenue. Earlier partial-run fixtures include a confirmed synthetic booking with one 51,200-centavo rental receipt and zero deposit held. Synthetic records/audit history are retained in the disposable project; no project or historical records were deleted.

## Application verification

- KJM MAIN: TypeScript, ESLint, **56 automated tests**, production build passed.
- KJM ADMIN: TypeScript, ESLint, **164 automated tests**, production build passed.

No application source, production environment file or existing migration SQL was changed in this approval/testing turn. New tooling and evidence are under `KJM MAIN/docs/phase9-migration020`. Authenticated browser acceptance remains a separate previously documented limitation; this task's checks were actual PostgreSQL and application build/test checks.

## Required next steps

1. Correct the sequence privileges under a reviewed corrective change.
2. Correct and regression-test full-balance rental receipt/adjustment idempotency.
3. Rerun the complete separate-connection deposit, refund, handover and expiration concurrency suite; reconcile retained synthetic liabilities explicitly.
4. Re-audit all financial table, function and sequence privileges.
5. Obtain production approval only after those checks pass; coordinate application/schema release and retain disabled public booking and ID defaults.

Cash and ID options are disabled, public booking is false, the diagnostic extension is absent, and production is unchanged. **Stopped; awaiting owner instructions.**
