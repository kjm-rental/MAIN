# KJM MAIN Resend notifications — prepared for launch review

Current email presentation: [reference-based redesign, previews and checks](email-redesign.md).

Latest read-only verification: [Resend configuration and safe test procedure](resend-safe-test.md). Production now contains the inspected 027 functions/triggers, but its migration registry still ends at 022; the earlier preparation notes below are historical. No normal delivery is enabled.

Updated October 23, 2026 (Asia/Manila). MAIN only. ADMIN, production data, deployed settings, live payment switches, and existing unrelated local edits were not changed. No migration was applied, no mail was sent, and no deployment/push was performed.

## Completed locally

Reused the existing `notification_outbox`, immutable event keys, unique recipient constraints, leases, generation error history, verified Auth email resolution, reminder scheduler, request fingerprints and retry RPCs from migrations 022/023. No parallel booking/email database was introduced.

Added branded HTML plus plain text, actual KJM logo, teal/sand colors, PHP amounts, Manila dates, booking reference, duration, Cash on Pickup and the separate ₱2,500 cash deposit. Dynamic fields are validated/escaped and unrecognized payload properties are discarded. No documents, document storage paths, private review notes, names or phone numbers are included.

Checkout makes a best-effort POST to `/api/notifications/booking/{bookingId}` **after successful finalization**. The route authenticates the user and explicitly checks booking ownership. The narrow wakeup now includes automatic confirmation events. Its service-only claim RPC is restricted to customer request/confirmation and admin new-booking events for that booking. It accepts no recipient, template, content or arbitrary event from the caller. Up to two independent leased deliveries run per request. Checkout does not await or depend on this result. A scheduler provides recovery if the browser closes or the wakeup fails.

`/api/notifications/dispatch` accepts authenticated GET/POST, schedules reminders only when separately enabled, and processes at most two queued emails per invocation. Errors returned to callers are generic; keys, provider response bodies and customer data are never logged. Synthetic `is_test` rows require an explicit test mailbox and are redirected exclusively there. Simulated rows cannot reach the transport.

## Event coverage after migration 027 and explicit activation

All SQL below is **prepared, not applied or tested against PostgreSQL**. Deployment schema state was not queried. The new migration replaces selected existing notification functions; it adds no business-rule or payment changes. Existing grants are retained and new functions are explicitly restricted.

| Requested notification                                  | Template / connection                                                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Booking request received                              | `booking_requested`; terms acceptance/finalization, pending/submitted bookings only                                                                               |
| 2 Booking confirmed                                     | `booking_approved`; actual confirmed status transition, including automatic confirmation; verification remains independent                                        |
| 3 Booking rejected                                      | `booking_rejected`; rejected status transition                                                                                                                    |
| 4 Booking cancelled                                     | `booking_cancelled`; cancelled status transition                                                                                                                  |
| 5 Booking reminder                                      | `pickup_reminder`; existing 24-hour scheduler for confirmed future pickups                                                                                        |
| 6 Pickup instructions                                   | Template ready; **unconnected**, no verified stored location/instructions source in existing email payload                                                        |
| 7 Handover confirmation                                 | `handover`; official `active` transition, not preliminary inspection insertion                                                                                    |
| 8 Return reminder                                       | `return_reminder`; existing scheduler, active rentals with future return only                                                                                     |
| 9 Rental completed                                      | `rental_completed`; official `completed` transition, not preliminary return inspection                                                                            |
| 10 Security deposit returned                            | `deposit_returned`; actual `cash_returned` ledger event and actual returned amount (including partial amounts)                                                    |
| 11 Booking modification                                 | `booking_modified`; confirmed motorcycle model/unit, pickup, return or total change, updated snapshot                                                             |
| 12 Thank you/review                                     | `review_request`; completed transition, configured HTTPS review link only; otherwise thank-you with website link                                                  |
| 13 Verification approved                                | `verification_approved`; actual overall approved transition with all required component statuses approved                                                         |
| 14 Verification rejected                                | `verification_rejected`; rejected transition. Resubmission uses separate `verification_action` copy and secure sign-in guidance                                   |
| 15 Admin new request                                    | `admin_booking_requested`; finalized request                                                                                                                      |
| 16 Admin cancellation                                   | `admin_booking_cancelled`; cancellation                                                                                                                           |
| 17 Admin modification                                   | `admin_booking_modified`; confirmed booking changes                                                                                                               |
| 18 Admin upcoming pickup                                | `admin_pickup_reminder`; existing eligible pickup scheduler                                                                                                       |
| 19 Admin upcoming return                                | `admin_return_reminder`; existing eligible return scheduler                                                                                                       |
| 20 Admin overdue                                        | `admin_overdue`; existing active-overdue scheduler, once per Manila date                                                                                          |
| 21 Admin documents submitted                            | `admin_verification_review`; document registration event, metadata only                                                                                           |
| 22 Admin manual review                                  | `admin_manual_review`; actual under-review/rejected/resubmission verification transitions. New document submissions also notify admin; no invented automatic PASS |
| 23–26 Online payment successful/failed/refunded/pending | Templates only. No dispatch mapping or database trigger. Online processing remains disabled by existing payment controls                                          |

Request notification generation moves from preliminary deposit insertion to finalization, so abandoned drafts do not produce customer request emails. Existing historical pending rows are not rewritten or backfilled. Cancellation/rejection explanations use only a future explicitly customer-safe `customerExplanation` field; private `status_reason`/verification notes are deliberately not copied. Current messages provide contact or secure sign-in guidance.

## Automatic confirmation — earlier email gate corrected

The owner clarified on October 23 that automatic booking confirmation must be preserved. The prepared notification migration now accepts actual guarded confirmation transitions without requiring `approved_by`. The confirmation template states that identity verification and pickup requirements remain separate. The booking-specific wakeup can claim the confirmation event and skip a superseded pending-request event without leasing multiple emails at once. No booking function, approval requirement, availability lock, price calculation or inventory rule was changed.

Migration 023 currently auto-confirms Philippine-resident bookings only; international bookings remain pending under the existing rules. This is an existing workflow gap against a universal automatic-confirmation objective, not a new manual approval requirement. Altering that international policy is beyond a small notification correction.

Customer email resolution still requires a confirmed Auth email belonging to the booking owner. Checkout supports anonymous Auth sessions and separately collects a form email; that form address is not automatically a verified Auth email. Guest delivery therefore requires an approved secure recipient-binding/email-confirmation flow. The worker must not silently use an arbitrary customer-entered email. See the [current verification and launch audit](../final-booking-verification/README.md).

## Configuration and activation (not performed)

1. Review `202610220027_resend_email_completion.sql` and verify the deployed baseline. It is prepared against migrations through 026 and must be tested on an isolated database before production approval/application. Do not run a blanket migration push: earlier pending payment migrations may require separate approval.
2. Set server-only `RESEND_API_KEY`, Supabase service role key, public Supabase URL and a random dispatch secret of at least 32 characters. Sender/reply/admin addresses are fixed in code: `KJM Motorcycle Rental <booking@kjmride.com>` and `kjm.moto.rental@gmail.com`. Domain verification is based on the owner's supplied configuration; no account credentials were inspected.
3. Set `RESEND_TEST_RECIPIENT` to a controlled safe mailbox. Optional `KJM_ADMIN_URL` must be the actual HTTPS login-protected ADMIN destination. Optional `KJM_REVIEW_URL` must be the real HTTPS review destination. Never use signed document URLs for either value. Review/pickup links and addresses are never invented.
4. Review pending outbox history before enabling delivery, including old test rows and historical events. Use an isolated test project first. Existing `sent` means provider API acceptance, not independently confirmed inbox delivery; bounce/delivery webhook tracking is not added.
5. After migration approval and isolated testing, enable **both** server `RESEND_ENABLED=true` and existing database `notification_settings.resend_enabled`. Explicitly choose `enabled_events` from the connected rows above. New categories are not silently enabled by migration. The existing preferences RPC has been extended to accept them. Keep legacy telegram-only/cash receipt categories out of the Resend launch selection: the worker intentionally records unimplemented categories as `unsupported_template`. Do not enable payment templates.
6. Reminders need `NOTIFICATION_REMINDERS_ENABLED=true`, database `reminders_approved=true`, pickup/return windows reviewed (24 hours by default), and reminder event categories enabled. Both claim and final preparation recheck status/timestamps. Cancelled/rejected/completed pickups/returns cannot dispatch.

Notification settings are kept in the git-ignored `.env.local`; existing values were preserved. No notification configuration block is kept in `.env.example`.

## Proposed scheduler — not installed

Smallest option: use the existing database scheduler RPC from a frequent authenticated call to this Vercel route. A Vercel Cron entry targeting `/api/notifications/dispatch` can use GET and `CRON_SECRET`; the route accepts that secret when `NOTIFICATION_DISPATCH_SECRET` is unset. If both are set, they must match for native cron. Alternatively, an existing trusted scheduler can POST with `Authorization: Bearer <NOTIFICATION_DISPATCH_SECRET>`.

Start with one invocation per minute if supported by the hosting plan, then adjust based on queue volume. Each invocation handles at most two emails; checkout separately wakes the two request notifications. A 10–15 minute schedule is adequate for approximate reminders at low volume but increases retry and operational-email latency. No `vercel.json`, new job or external service was added; schedule/plan selection remains for owner review before infrastructure activation. Monitor queue age, failed/generation-error rows and cron failures in the existing admin system.

## ADMIN integration points — no ADMIN files modified

On a shared Supabase database, the prepared database triggers can observe existing ADMIN writes without a new ADMIN email implementation. Verify ADMIN actually commits these authoritative operations:

- Preserve automatic booking confirmation. Existing rejected/cancelled status transitions generate the corresponding notifications; no new administrator booking approval is required.
- Record inspections and official `active`/`completed` status separately; email follows the status. Do not send completion on return inspection alone.
- Record deposit return with the existing `cash_returned` event and amount; never infer return from completion.
- Update `customer_verifications.overall_status` for approved/rejected/resubmission outcomes.
- Modify confirmed booking fields through existing authorized business-rule paths. New email triggers do not add an edit capability.

ADMIN may need UI work to preserve/select the additional event categories: its existing settings form could submit the older closed list and drop newly enabled categories. That UI was not inspected or modified. Optional immediate ADMIN event wakeups are not added; the approved scheduler drains those events.

Pickup instructions need an actual trusted stored location/instructions source and an immutable enqueue event after approval/before pickup. A future manual booking-review event needs a genuine existing review marker if separate mail is desired. Customer-safe rejection/cancellation reasons require a reviewed public-facing field, not reuse of private notes. Reported ADMIN integrations require verification in that project before launch.

## Reliability and verification

Provider requests use the existing outbox UUID as a stable Resend idempotency key. SHA-256 fingerprints cover the complete request including recipient. Final preparation rechecks eligibility and recipient; changed fingerprints/recipients are held. Network errors, 429 and 5xx use bounded exponential retry through the existing six-attempt state machine. Existing 23-hour retry cutoff stays inside Resend's documented 24-hour idempotency window. Expired leases/ambiguous success responses require review rather than an unbounded resend. Database generation failures preserve successful booking operations and are recorded without customer content. A crash after acceptance but before finish remains held for review, so delivery is not guaranteed automatically in every failure mode.

Provider references: [send email API](https://resend.com/docs/api-reference/emails/send-email), [idempotency window and header](https://resend.com/docs/dashboard/emails/idempotency-keys).

Verified locally:

- Current focused run: 106 tests passed across notification, verification/OCR, booking validation, document validation, deposit calculation and payment-disable routes. Notification RPC/provider calls were mocked; one real local OCR test used a synthetic image. No live emails or production mutations.
- Recipient ownership, fixed admin recipient, test routing, provider failures, stable idempotency key/body, fingerprint preparation, changed recipient protection, cancelled preparation, unsupported online payments, optional link validation, Manila dates, PHP amounts and private-field exclusion.
- Static SQL contracts cover official transitions, status eligibility guards, unique enqueue keys and absence of activation/data updates. **They do not prove PostgreSQL execution, trigger permissions, concurrency or transactional rollback.**
- TypeScript `tsc --noEmit --incremental false` and focused ESLint passed. No full application build or unrelated suite was run.
- The synthetic request HTML was visually inspected in Edge at 390px and 800px. Document scroll widths matched the viewports; no horizontal overflow. See HTML plus mobile/desktop PNGs in this directory. Actual Gmail, Outlook and mobile mail-client inbox rendering remains to be checked with safe recipients.

Remaining launch work: secure guest email binding, international confirmation policy review, custom verifier PASS/evidence limitations documented in the linked audit, isolated SQL/trigger/concurrency integration tests, migration approval/application, secure environment settings, event preferences, approved scheduler installation, ADMIN workflow/settings verification, pickup data integration, and safe provider/inbox acceptance tests.
