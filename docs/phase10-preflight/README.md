# Migration 022 preflight

**Ready for disposable testing after owner approval. Not applied remotely.** No production writes, application deployment, real Telegram messages or customer emails occurred.

## Read-only remote verification

- Disposable project reference: `uuxjymzrtncrnnkvdpjy`, checked against guarded metadata/project-specific connection identity. PostgreSQL queries used BEGIN READ ONLY.
- All migrations 001–021 are applied; 022 is the only pending migration. Its tables are absent and required booking/financial/verification/deposit/inspection/audit dependencies are present.
- Fresh read-only API checks confirm public booking and anonymous Auth are **disabled in both disposable and production**. Notification settings and worker RPCs are absent in both projects.
- Existing deposit sequence effective client permissions remain revoked. Public-schema default grants remain broad; 022 explicitly removes inherited access from its own objects and introduces no sequences.
- Production was contacted only through read-only HTTPS settings/schema calls. API credentials were used in memory, never emitted or persisted. No production SQL connection or mutation was made.

## Security review

022 creates three tables, two indexes, seven authoritative triggers and 12 functions. There are no destructive statements, existing record rewrites, price changes, auth configuration changes, network calls or automatic Cron activation. Only its new settings defaults are inserted, with delivery/reminders disabled.

All three tables enable and force RLS. Anonymous users have no access. Authenticated users have SELECT only, filtered to active administrators. Client and service-role direct mutations are revoked. Unauthorized customers cannot read or modify notification records.

All SECURITY DEFINER functions use empty search_path and qualified application objects. Three private helpers deny direct client/service access; four management functions recheck active-admin authorization; five worker functions allow only the trusted service role. Browser server actions refresh administrator authorization too.

The scheduled endpoint requires an exact ≥32-character bearer secret with timing-safe comparison. It accepts no caller-selected event, recipient or chat. Actual localhost checks returned 401 for missing/invalid authentication and 405 for GET.

Events derive from immutable booking deposit snapshots, guarded booking status changes, verification transitions, authorized cash/deposit ledger events and rental inspections. The old editable notification_events table is not a dispatch source. Unique source/channel/recipient keys, locked claims, SKIP LOCKED, UUID leases, attempt bounds and request fingerprints prevent duplicate logical delivery. Ambiguous Telegram sends and expired leases are held for review; Resend uses stable provider idempotency and a conservative 23-hour window. Exactly-once external delivery is not claimed.

Payloads store minimal booking/model/date/amount/status information and snapshot deposit selection. Emails resolve only from verified Auth records. Customer names/phones, identity documents/numbers/types, private storage URLs, notes, PINs and tokens are excluded. Safe error codes replace raw provider errors.

Mock adapters make no network calls, claim only synthetic rows and mark simulated results. Mock mode is refused under NODE_ENV=production. Live transports reject synthetic records and require server approval/configuration plus the database channel flag. Current local configuration and migration defaults are disabled, and production lacks the worker schema. Hosted deployment secrets were not independently inspected; activation remains a separate approved deployment/configuration step.

## Executed checks

| Check | Result |
| --- | --- |
| Notification unit/mock/worker/security tests | 40 passed |
| Local PGlite PostgreSQL migration ordering | Actual 001–022 execute; 53 SQL assertions passed |
| Native PostgreSQL concurrency rerun | 18 assertions passed across six separate-connection races |
| Duplicate payment callbacks | One receipt and one notification per channel |
| Concurrent claims/completion | Distinct backends/leases; stale completion rejected |
| Concurrent manual retry | One retry and one audit; attempt history preserved |
| Failed financial operations | Ledger/outbox unchanged; local synthetic balance reconciled |
| Public scheduler requests | Missing/invalid bearer rejected |
| Remote settings/history/dependencies/grants | Read-only checks passed |

The native cluster was loopback-only and stopped afterward. Local Supabase auth/storage and Cron bootstrap shims do not replace hosted validation. Remote migration execution, real provider delivery and authenticated administrator browser tests were not performed.

No blocking finding was identified. Broad platform default grants remain a future-migration review requirement; 022 neutralizes them for its own objects. Hosted Supabase tests, actual provider verification and approved messages remain pending.

Reviewed SHA-256: `b962b9fb4cde2c72345dfec7571c52ce4c56cec5064c08f2c634918b58715917`.

Evidence: remote-state.json, remote-auth-settings.json, auth-and-environment.json, verification.json, local-database-results.json and native-concurrency-results.json. Migration/application source unchanged during review. Wait for approval before applying 022 to disposable; never apply it to production under this approval scope.
