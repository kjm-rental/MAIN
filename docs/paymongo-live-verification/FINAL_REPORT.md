# Final database verification

Migration 026's scoped database compatibility and settlement/concurrency checks passed. It is ready for **reviewed, disabled production application**, conditional on a verified backup/restore plan and explicit owner approval. It was not applied to production. This is not approval to collect money or proof of LIVE provider compatibility.

## Production comparison (SELECT only)

Authenticated Supabase CLI Management API access executed only read-only catalog queries, pinned to the original production project. Scoped table columns/defaults/constraints/triggers, table and column grants, forced-RLS flags, policies, relevant function definitions/grants/owners, and anon/authenticated/service-role attributes match the staging baseline. See `schema-parity.json` and `permission-parity.json`. Staging-only PayMongo TEST objects were excluded deliberately; no whole-project platform/service parity is claimed. The comparison baseline was captured before installing 026 in staging; its intended new cash-receipt guard differs after installation.

Public anonymous reads also verified all nine current production motorcycle rates against staging, and the existing approved refundable cash deposit of 250000 centavos. No real customers, bookings or private documents were read/copied; no production DDL/DML was executed.

## Isolated staging results

The exact 026 SQL was applied only to the existing pinned staging project, which has the matching core schema. Controlled fixtures reference an existing synthetic `@example.invalid` customer and existing staging unit. Fixture bookings use non-test provenance only to exercise the LIVE SQL path, carry explicit `LIVE-STAGING-` references, and do not represent real customers/rentals/money. No PayMongo API was contacted. Only the isolated SQL simulation gate was temporarily enabled; application LIVE flags/keys and production activation remained off. All readiness flags were reset and all new reservations cancelled afterward. Synthetic fixtures/receipts remain in staging for audit, not in the real website/database.

`final-database-results.json` records 20 successful checks:

- Server rental quote of PHP900 for one ADV160 day; deposit stays separate at PHP2500. All nine public rates also match.
- Simultaneous preparation returns one intent; simultaneous creation claim has exactly one winner.
- Simultaneous duplicate settlement returns paid and inserts exactly one intent/attempt/event, rental-only at 90000 centavos.
- TEST-mode settlement and a distinct duplicate payment are rejected; paid intent freezes reservation price/dates/unit.
- Concurrent same-unit confirmations have exactly one winner under existing reservation guards.
- Expired bookings cannot prepare or confirm; late receipts enter review without financial credit or reservation revival.
- Handover still rejects missing inspection/document requirements.

Additional rollback-only financial checks verified that the existing admin adjustment RPC can record a refund against a verified gateway receipt (PHP900 minus PHP50 nets PHP850), and that Cash on Pickup recording still works for a booking without an online intent. Those cash/refund records were rolled back. No automatic provider refund occurred. See `refund-cash-results.json`.

15 focused payment/webhook unit tests passed. They cover raw bytes/signature freshness, TEST/LIVE mode/key isolation, duplicate webhook identity and retry behavior, interrupted creation, known-session recovery, expiration/payment races, failed payments causing no settlement, and refunded/disputed/multiple provider payments requiring review. Provider responses are mocks; genuine HTTPS delivery and LIVE API responses are unverified.

One fixture-harness bug was corrected: the server quote field is `total_php`, not `quoted_total_php`. No migration/application defect was discovered in the executed scope. The first failed fixture transaction rolled back; 026 was not rerun unnecessarily. Staging history now records 026.

## Remaining application / activation blockers

1. Verify a current secured backup and successful independent restore rehearsal; then obtain explicit approval to execute the hash-pinned atomic production bundle. Existing documented recovery instructions remain applicable. No backup or restore was performed in this task.
2. Configure separate LIVE API/webhook/scheduler credentials, matching production service-role credentials, and trusted HTTPS origin. Verify QR Ph capability on the **LIVE** account; TEST capability is not proof of LIVE enablement.
3. Verify real HTTPS signed delivery and scheduled reconciliation/provider compatibility under controlled approval. LIVE creation remains off.
4. Adopt and verify operational handling for unresolved creation, delayed/multiple/refunded/disputed receipts. Failed/expired permanent intents intentionally block alternative charges/cash until operator resolution. Automatic PayMongo refunds and automatic cash fallback are not implemented; generic retry/review alerts are not an automated refund workflow.
5. Separately approve booking submission/activation changes. The real website's local submission restriction remains intact; this task changes no public booking switch or production configuration.

Production application is a database installation with activation disabled, not a LIVE launch. Do not flip readiness flags because SQL tests passed alone. The offline deployment generator and `production-apply.sql` remain prepared, not executed.
