# Phase 10 — Database preparation and local verification

The canonical prepared migration is `supabase/migrations/202610110022_transactional_notification_outbox.sql`. It requires 001–021 in order. **It was not applied to either Supabase project.** The owner explicitly chose “Prepare migration; do not apply it.” Production migrations and existing data are unchanged.

`local-database.mjs` runs a throwaway in-memory PGlite PostgreSQL engine and executes the actual repository migration files 001–022. Supabase-provided auth/storage objects are bootstrapped locally; native pg_cron is replaced with an explicitly documented local scheduling shim. All KJM schema, financial functions, guards, RLS, grants and migration 022 logic execute locally. This is not the disposable Supabase environment. The same suite also passed on a throwaway native PostgreSQL 18.4 cluster; separate native connections were tested by native-concurrency.cjs. Neither local engine certifies hosted Supabase or production Cron configuration.

The local suite tests migration ordering, authoritative request/payment/status/deposit/inspection/verification triggers, idempotent logical events, rollback, customer and suspended-admin authorization, no client outbox writes, worker leases, stale-token rejection, failed delivery/recovery, request-fingerprint conflicts, ambiguous-delivery holds, audited manual retry, no duplicate logical retry, forced RLS, safe SECURITY DEFINER grants, no new sequences, preserved payment during forced generation failure, authoritative generation repair, provisional/approved reminders, cancellation/expiry/pending suppression, rescheduling and timezone-independent keys.

Run locally with the approved npm package `@electric-sql/pglite` installed in `/tmp/kjm-phase10-db`:

```sh
node docs/phase10/local-database.mjs
```

No remote credentials are read by this harness. Synthetic data is confined to its in-memory database; the entire fixture transaction rolls back and the engine closes. These fixtures temporarily configure local approved reminder timings for assertions only; no shared or production deposit amounts/settings are changed.

Full implementation, Telegram/Resend setup, manual verification and production activation requirements are in the ADMIN [Phase 10 report](../../../KJM%20ADMIN/docs/phase10/README.md). Final file inventory and baseline-preservation checks are stored with the ADMIN report.

## Native PostgreSQL evidence

`native-database-results.json` records the same actual 001–022 migration ordering and 53 SQL assertions on PostgreSQL 18.4. `native-concurrency.cjs` / `native-concurrency-results.json` record 18 passed assertions across six races with distinct simultaneous PostgreSQL backend PIDs. Connections are hard-coded to loopback; no remote credentials are used. The native cluster was stopped after tests.

The harness uses the official npm-registry `@embedded-postgres/darwin-arm64` binary distribution installed only in `/tmp/kjm-phase10-db`. Run it only against a freshly initialized **local throwaway** cluster on 127.0.0.1:55432. The full migration harness creates local roles/schemas and must not be pointed at an existing or remote database. Native mode is `KJM_PHASE10_NATIVE=true node docs/phase10/local-database.mjs`, followed by `node docs/phase10/native-concurrency.cjs`. The concurrent fixtures are clearly synthetic and any interrupted local fixture is reconciled before rerunning. Nothing here authorizes applying migration 022 to a Supabase project.
