# Phase 9 — Security and idempotency corrections

Only disposable project `uuxjymzrtncrnnkvdpjy` was migrated. The database connection guard excludes production `slevojynuumrvgiznmxk`. Production deployment requires separate owner approval: apply unchanged migration 020 followed immediately by corrective migration 021, before exposing the new workflow. Neither migration was applied to production.

## Root causes and exact corrections

**Sequence:** migration 020 introduced exactly one public sequence, `public.security_deposit_events_sequence_seq`, owned by `postgres`. Supabase's schema-specific default ACLs granted client roles USAGE, SELECT and UPDATE. Migration 021 explicitly revokes all access from PUBLIC, anon and authenticated. Effective checks include inherited permissions; actual nextval, currval, sequence reads and setval fail with SQLSTATE 42501 for both client roles. Owner/security-definer operations remain functional; the existing trusted service_role grant remains. Platform-wide default grants were inspected but not changed: future migrations must explicitly review sequence permissions.

**Payments:** financial RPCs checked idempotency before their serialization locks. Concurrent requests could both miss the lookup; after the first committed, the second saw an exhausted balance and failed before reaching unique-constraint recovery. Migration 021 adds a key/fingerprint lookup after the booking lock in admin_record_offline_payment, and after the original-event plus booking locks in admin_record_payment_adjustment, before checking balances. Identical requests return the original intent; mismatches fail. Active-admin authorization, validation, fingerprints, unique-key recovery, financial bounds, immutable ledger events, payment attempts and audits are preserved. No frontend workaround or additional receipt is introduced.

Migration 020's source and stored statements remain unchanged. Migration 021 contains only the sequence revoke, two function replacements and explicit execute permissions. It has no data deletion, price/policy/RLS changes or authentication configuration changes.

## Evidence and repeatable checks

- deployment.json: exact disposable target, 001–020 history, only 021 pending, checksum, default ACL audit, unchanged record counts and effective permission removal.
- integration.cjs / integration-results.json: rollback-only workflow tests against the committed schema, including policy controls, immutable snapshots, authorization, customer isolation, payment/deposit gates, inspections, cancellation and completion. ID legal/custody approval is synthetic and rolled back. The fixture 24-hour expiration is rolled back; live disposable expiration remains 60 minutes.
- sequence.cjs / sequence-results.json: eight actual client permission denials.
- authorization.cjs / authorization-results.json: suspended administrators cannot retry a recorded payment, adjust payments or manage deposits. Temporary suspension is rolled back.
- lint.cjs / database-lint.json: actual PostgreSQL plpgsql_check diagnostics, security-definer/search_path and forced-RLS/direct-write ACL review. Diagnostic extension installation is rolled back.
- concurrency.cjs / concurrency-results.json: distinct simultaneous backend PIDs, committed/rolled-back outcomes, identical/conflicting retries, full/partial receipts, full refunds/reversals, competing deposit collections/refunds, inventory/approval/pickup/return/expiry races and reconciliation. Synthetic authorized customers are used with public booking disabled. Test cash policy is restored to disabled; ID remains disabled. Records are retained for audit.
- The interruption test destroys a real PostgreSQL socket after confirmed commit, discards the application result, and retries on a new connection. It tests durable-commit recovery; ambiguous COMMIT acknowledgement loss is not simulated.
- concurrency-initial-harness-error.json: first expanded run passed 58 assertions then failed because its new cleanup step named a nonexistent cancellation RPC. The harness was corrected to use existing admin_transition_booking_with_reason. This was a test-harness failure; the final run repeats the full suite.
- reconcile-prior-fixtures.cjs / prior-fixture-reconciliation.json: existing cancellation/refund/deposit-return RPCs reconcile only synthetic, test-tagged fixtures left by interrupted/failed runs. Ledger records and audits are retained.
- postflight.cjs / postflight.json: migration source/database hashes, environment-file hashes, disabled flags, final fixture balances, matching receipt/event/attempt counts, no duplicate financial keys and sequence permissions.

Run PostgreSQL scripts sequentially, particularly integration before concurrency, to avoid shared inventory/policy locks. Credentials are read from the existing approved local test setup and never emitted.

No authenticated browser tests were rerun for these database-only corrections. No public booking, anonymous authentication, physical ID deposit policy, gateway, messaging integration, production migration or application deployment was enabled. Model-specific deposit amounts remain unimplemented.

## Final verification result

Migration **202610110021** was committed to **uuxjymzrtncrnnkvdpjy only**. Migrations 020 and 021 are ready for a separate production deployment review, as a combined 020 → 021 release. Production has not been contacted or modified by these database scripts, and no application was deployed.

| Verification | Result |
| --- | --- |
| PostgreSQL workflow integration | 80 passed, 0 failed; synthetic changes rolled back |
| PostgreSQL concurrency | 74 assertions passed, 0 failed across 18 simultaneous-connection races |
| Sequence access regression | 8 passed, 0 failed |
| Suspended administrator regression | 3 passed, 0 failed |
| Database lint | 0 diagnostics/errors; 13 reviewed functions, four forced-RLS tables |
| MAIN automated tests | 56 passed |
| ADMIN automated tests | 164 passed |
| TypeScript / ESLint | Both applications passed |
| Production builds | Both applications passed; no deployment |
| Final fixture reconciliation | All 12 retained synthetic bookings have zero rental and deposit balances |
| Receipt reconciliation | Intent, event and attempt counts match; no duplicate financial keys |
| Source/history hashes | Stored migration 020/021 statements match files; 020 unchanged |
| Environment files | MAIN and ADMIN .env.local hashes unchanged |
| Final flags | Public booking, cash deposit and physical-ID deposit remain disabled |

The first expanded concurrency run failed after 58 passing assertions because the new harness referenced a nonexistent cancellation RPC. After correcting the harness to use the existing transition RPC, the complete final run passed. One intermediate harness launch also failed JavaScript parsing due to a duplicate local variable; that was corrected before the final run. Neither required changes to business logic. Retained failed-run fixtures were reconciled through existing authorized cancellation/refund actions, with no record deletions.

No remaining security regression was found within the reviewed scope. The platform default sequence privileges still grant client access to future sequences: future migrations must review and explicitly restrict any new sequence. Those platform-wide defaults were not changed. Migration 020 must not be approved alone; 021 must follow it in the same controlled release before client exposure.

Not executed: authenticated browser verification, production database tests or deployment, and ambiguous COMMIT acknowledgement-loss fault injection. The real socket-interruption test covers recovery after a confirmed successful commit. Physical ID custody tests use rollback-only synthetic legal approval; they do not approve or activate a real policy. Model-specific deposit amounts remain unimplemented.

## Exact files added

The only database implementation file added is `supabase/migrations/202610110021_deposit_sequence_and_payment_idempotency.sql`. No existing application source, prior migration, ADMIN source or production environment file changed. The additional test scripts, deployment evidence and report files under `docs/phase9-migration021/` are listed in `files-changed.json`.
