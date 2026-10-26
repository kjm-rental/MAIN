# Resend configuration and safe one-email test

Verified October 23, 2026 (Asia/Manila). No email sent. No booking created, outbox claimed, reminders scheduled, migrations applied, production application data changed, payments enabled, deployment or push performed. Environment files were not edited in this task.

## Configuration result

| Item                             | Result                                                                                                                                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-side Resend API key       | Present through Next's environment loader; plausible key format. No public Resend key variable found; production code reads it only in the server notification module. Key value never displayed. Provider authentication/permission not tested.                                    |
| `RESEND_TEST_RECIPIENT`          | Present and syntactically valid; value never displayed. Mailbox ownership is for the operator to confirm before the future send.                                                                                                                                                    |
| `NOTIFICATION_DISPATCH_SECRET`   | Missing; no `CRON_SECRET` fallback configured. Needed before authenticated normal-worker invocations, but not for the standalone local smoke test.                                                                                                                                  |
| `RESEND_ENABLED`                 | Explicitly `false` locally.                                                                                                                                                                                                                                                         |
| `NOTIFICATION_REMINDERS_ENABLED` | Explicitly `false` locally.                                                                                                                                                                                                                                                         |
| Connected database               | **PRODUCTION**, project `slevojynuumrvgiznmxk`; confirmed against local connection URL, authenticated project listing and prior production target documentation. The separate project `uuxjymzrtncrnnkvdpjy` is named `kjm-phase6-integration-test` and was not used for this task. |
| Database delivery/reminders      | `resend_enabled=false`, `reminders_approved=false`. Neither changed.                                                                                                                                                                                                                |

This is **ready for an isolated provider smoke test after explicit authorization**, subject to provider acceptance. It is **not ready for normal guest booking delivery**. No claim that the API key, domain permissions or real inbox delivery has already been tested.

## Migration 027 and recipient-security verification

Production catalog/configuration queries ran in `BEGIN READ ONLY` transactions (`transaction_read_only=on`) ending in rollback. No mutation-capable application RPC was invoked. A separate authenticated REST OpenAPI GET confirmed the local service credential can read the schema and all four required worker RPCs are exposed.

- Migration 027's eight relevant installed function bodies match the local prepared source after whitespace normalization: enqueue, capture, eligibility, prepare, delivery context, booking-specific claim and both new trigger helpers. Both new triggers are present and enabled.
- Required notification, booking terms/confirmation and verification tables exist with RLS enabled and forced. Notification reads are restricted by active-admin SELECT policies.
- Worker RPCs deny anonymous/authenticated execution and allow the service role. Private trigger helpers deny client/service execution. Security-definer functions use an empty search path.
- Anonymous outbox read, authenticated outbox INSERT/UPDATE and service-role direct INSERT privileges are denied. Logical-event uniqueness is installed on `(event_key, channel, recipient_reference)`.
- **History discrepancy:** the migration registry still ends at `202610110022`; it has no 023–027 entries, despite the installed later objects. This is consistent with manually running SQL without recording migration history. Do not blindly rerun 027: its new functions/triggers already exist. Reconcile history separately under the appropriate approval; nothing was repaired here.
- New admin/review/completion categories are not selected in the current `enabled_events` list. Delivery remains off. Review event preferences before any future activation.

**Guest email binding is still absent from the installed notification logic.** Both context and final preparation resolve only the booking owner's confirmed Auth email. There is no fallback to the separately entered customer email and no installed guest-binding function/table was found in the inspected application schemas. Anonymous guests therefore cannot receive normal customer notifications until an approved secure binding flow exists.

This recipient restriction prevents a customer from redirecting booking mail by changing a submitted email field or request parameter. The booking wakeup additionally checks authenticated booking ownership and accepts no recipient override. Admin recipients are fixed in the database and checked again by the worker. Synthetic `is_test` rows alone redirect to the server-controlled test mailbox. Recipient changes between context and final preparation, and changed request fingerprints, are blocked. These conclusions combine installed catalog/source inspection with local mocked-worker tests; no production spoofing/mutation test was attempted.

Sanitized schema/permission evidence: [resend-readonly-verification.json](resend-readonly-verification.json). No customer row contents, actual email recipients or secret values are included.

## Existing worker limitation

`dispatchOne` claims a booking-linked outbox row; it cannot send a genuine provider test without such a row. Its simulated/mock mode deliberately does not call the provider. Do **not** turn on normal delivery, call `/api/notifications/dispatch`, invoke a claim/reminder RPC, create a production booking or inject a production outbox row for this test.

The new local-only `scripts/resend-smoke-test.cjs` reuses the existing branded template and fixed sender/reply-to. It has no Supabase import, database client, scheduler or public HTTP endpoint. It prepares entirely fictional details prominently marked TEST ONLY. It sends exclusively to `RESEND_TEST_RECIPIENT`; there are no `to`, CC or BCC overrides. Both normal-delivery flags must stay explicitly false.

## Exact safest procedure

1. Review `RESEND_TEST_RECIPIENT` privately in `.env.local` and confirm it is the intended controlled mailbox. Leave both normal-delivery flags false. No dispatch secret or database change is required for this isolated command.
2. From MAIN, run the safe default/dry run. This reads current environment configuration and renders the template, but performs **zero provider/database calls**:

   ```sh
   cd '/Users/mac/Desktop/KJM/KJM MAIN'
   node scripts/resend-smoke-test.cjs --dry-run
   ```

   Require `mode: "dry-run"`, both disabled flags true, `databaseAccess: false`, `priorAttemptRecorded: false`, and `emailSent: false`. No actual key or recipient is printed.

3. **Only after explicit authorization to send one email**, run this once:

   ```sh
   node scripts/resend-smoke-test.cjs --send
   ```

   This command was **not run** against the real provider in this task. It sends one POST, with a stable request fingerprint/idempotency key, to Resend. It does not enable normal delivery, drain any queue, send admin notifications or touch Supabase.

4. On success, the command prints only acceptance booleans. Check the controlled mailbox (including spam) and Resend activity for the subject **[TEST ONLY] KJM email configuration test — no booking created**. Provider acceptance does not prove inbox delivery; inspect the actual received HTML/plain text and From/Reply-To.
5. The command creates an exclusive, git-ignored `.resend-smoke-test/attempt.json` **before** attempting a send. A concurrent/repeated command is blocked, including after timeout, failure or ambiguous response. It never automatically retries. Do not delete this record or rerun to resolve uncertainty; review Resend activity first. The record holds timestamp/fingerprint/status/provider ID only, with no API key or recipient value. A second authorized test would require a deliberate separate review/reset.

Resend documents the send endpoint and its 24-hour provider idempotency window: [Send Email API](https://resend.com/docs/api-reference/emails/send-email), [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys). The persistent local attempt guard additionally prevents routine reruns beyond that window.

## Verification performed

- Real local dry run: passed; `emailSent=false`, `databaseAccess=false`, no prior send attempt exists.
- **77 tests passed across four focused files**, using mocked provider/RPC calls. The eight new smoke-test cases verify dry-run isolation, false delivery flags, no recipient override, invalid-recipient rejection, exactly one fictional message, rerun blocking, timeout handling and sanitized provider failure.
- Focused ESLint, TypeScript and whitespace checks passed. No full application build or broad test run.
- Both `.env.local` and the local attempt-record directory are git-ignored.

Remaining before normal delivery: secure guest email binding, migration-history reconciliation, reviewed event preferences, dispatch secret and approved scheduler configuration, plus separately authorized provider/inbox and isolated booking-workflow tests. No production activation is part of this task.
