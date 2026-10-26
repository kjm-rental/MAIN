# KJM MAIN — final booking, custom verification and Resend audit

October 23, 2026 · Asia/Manila. Local code inspection and isolated synthetic tests only. No production state was queried or changed. No ADMIN files were read or changed. No migration, deployment, push, real email, external verification service or payment activation occurred.

## AUTOMATIC BOOKINGS

Preserved the existing booking engine. `finalize_booking_request` in migration 023 validates the owner, approved terms, required contact/declaration data, current private upload objects and metadata, live inventory hold and available unit. Row/advisory locks, overlap checks, immutable terms acceptance, idempotent finalization, expiry and server pricing remain unchanged.

**Existing limitation:** only `philippine_resident` finalizations automatically change status to `confirmed`. The `international_visitor` branch returns the existing pending status. This does not meet automatic confirmation for every customer. Changing international rules requires a separate workflow decision; it was not silently changed in a notification task.

Corrected the earlier **prepared** email migration: actual `confirmed` transitions now generate the existing `booking_approved` email event without a separate administrator or identity approval gate. Confirmation wording explicitly separates booking confirmation from identity verification and physical handover. ADMIN receives the existing new-booking event, now worded as “New Booking” without suggesting a newly introduced approval requirement.

The owned-booking wakeup now claims customer confirmation as well as pending-request/admin-new-booking events. It scans past superseded pending-request rows but leases only one eligible event per RPC. Pending-approval copy remains available only for genuinely pending/submitted bookings. Unique event keys and the existing outbox prevent creation of duplicate logical confirmation events.

These connections are local/prepared, **not operational production delivery**. Migration 027 remains unapplied and Resend configuration/activation remains outstanding.

## CUSTOM IDENTITY VERIFICATION

This is the existing in-house system, not a third-party provider. No replacement was introduced.

| Review question             | What MAIN currently implements                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Required uploads         | Government ID for Philippine residents or passport for international visitors, plus license front. License back is supported but always optional in current UI. IDP is supported “if applicable.” No configured attribute-based back-image requirement exists.                                                                       |
| 2. Private storage          | `identity-verification` bucket is declared private, limited to 8 MB and allowed image/PDF types. Authenticated owner/admin read policies; no public document rendering or public bucket URL in these flows.                                                                                                                          |
| 3. Secure replacement       | `register_verification_resubmission` requires the owning session, eligible pre-pickup status, actual `resubmission_required`, requested document kind and a matching private object. It supersedes old metadata and resets relevant checks. A plain rejected case is not directly replaceable until staff request correction.        |
| 4. Automatic checks         | Required-current-upload presence; declared/decoded size and type; decode success; image dimensions and basic brightness/contrast; bounded local English Tesseract OCR; high-confidence labeled field parsing; declared/OCR name comparison, expiry comparison in Manila, category-notation comparison and candidate age calculation. |
| 5. PASS / FAIL / REVIEW     | **Overall automatic PASS is not implemented.** Any failed check returns `failed`; otherwise it always returns `manual`. Individual checks can pass without approving identity.                                                                                                                                                       |
| 6. Recorded decisions       | `customer_verifications` stores component/overall statuses; `verification_reviews` and audit logs record the existing authorized staff decisions. The MAIN prescreen endpoint does **not** persist its OCR/check results or a decision; it returns only status and timestamp.                                                        |
| 7. ADMIN access             | Active-admin RLS grants access to stored verification records/reviews and private files. MAIN's ephemeral prescreen evidence is not available as a saved result. ADMIN UI behavior was not inspected, so display and independent ADMIN checks are unverified.                                                                        |
| 8. International renters    | Passport/IDP inputs, entry/country declarations, separate international check and manual review exist. Foreign entitlement is not automatically established; international bookings do not auto-confirm in the existing finalizer.                                                                                                   |
| 9. No second approval       | Handover consumes the existing complete approved component statuses; it does not require a second identity-review record. There is currently no trusted automatic PASS writer to populate those statuses without staff review.                                                                                                       |
| 10. Uncertain/failing cases | Prescreen returns manual/failed and does not approve or reject the customer record. Document-submission notifications bring staff attention; the prepared email trigger also routes actual under-review/rejected/correction status transitions to staff. No claim that a prescreen failure is durably flagged in Supabase.           |
| 11. Customer status         | Owned booking status page displays overall verification status separately from confirmation and shows supported correction instructions/upload controls. A temporary OCR summary is not the stored verification status.                                                                                                              |
| 12. Handover                | Existing version-9 SQL guard requires overall plus identity/license/entitlement/international approval, current declared license expiry, required document metadata, inspection, motorcycle assignment, rental payment and deposit resolution. Booking confirmation alone does not satisfy it.                                       |

### What a passed or failed result means today

A component/file/OCR “passed” result is advisory. Even matching high-confidence OCR and good-quality images produce overall `manual`. There is no existing genuine all-checks-passed execution path to connect to automatic VERIFIED. Automatically promoting these results would bypass missing checks and invent success, so no such promotion was added.

Official overall `approved` is computed by the existing authorized review RPC after all component statuses pass. The prepared approval email now rechecks all those components. Upload, prescreen, client-supplied JSON and booking confirmation cannot themselves trigger verification approval. A future **trusted** automatic decision path could reuse these same statuses and email event, but it needs validated criteria, secure evidence recording, provenance and server-only write authorization first; none is claimed implemented here.

Missing/unreliable attributes: document authenticity, binding the document to its actual holder, reliable layout/language coverage, authoritative motorcycle entitlement by issuing country, a structured minimum-age rule and verified comparison birthdate. PDFs and ambiguous OCR remain manual; blur/glare/readability are not reliably measured. Candidate age is not an age-eligibility decision. No address, policy, legal entitlement or verification success was invented.

## RESEND EMAILS

Reused the existing templates, worker, outbox, leases, attempt/status logging, idempotency keys, recipient checks and retries. Updated only notification semantics and focused coverage.

- **Prepared connections:** confirmed/cancelled/modified booking, pickup reminder, official handover, return reminder, completed rental, actual deposit return, thank-you/review, actual verification approval/rejection/correction; admin new booking/cancellation/modification/upcoming pickup/upcoming return/overdue/documents/review.
- **Not connected:** pickup instructions still lack a trusted stored pickup location/instructions source and enqueue event. Review CTA is conditional on a real configured review URL. No online payment template can dispatch.
- **Guest-email blocker:** recipient resolution requires a verified Auth email tied to the booking owner. Anonymous guest checkout only records a separately entered customer email; it does not bind/verify that address in Auth. No unsafe fallback was added. A secure guest recipient-binding or verification flow is needed before guest customer emails can work. Admin mail uses only the fixed owner mailbox.
- **Configuration:** review/test migration 027 in isolation, then obtain approval before any production application. Server-only Resend API key, service-role key and dispatch secret, safe test mailbox, reviewed event settings and scheduler are required. Both app and database delivery switches must explicitly allow sends. Actual delivery remains disabled in the prepared configuration; deployed settings were not inspected.

See [notification setup and event matrix](../notifications/README.md). “Sent” records provider acceptance; real deliverability/inbox rendering and provider callbacks have not been tested.

## KJM ADMIN

No ADMIN project changes. Confirm its use of the shared authoritative operations:

- Review identity/license/entitlement/international checks through the existing authorized review workflow. No extra identity approval when those genuine checks already pass.
- Request resubmission for correctable documents and display the permitted customer-safe instructions. Surface incomplete/uncertain cases and review results; MAIN prescreen results currently are not saved for it.
- Record physical inspection and the guarded `confirmed → active → completed` transitions, actual cash payment and separate cash deposit collection/return events. Sending email does not perform these operations.
- Preserve extended email event categories in its notification preferences form and monitor outbox/generation failures. Scheduler setup supplies eventual delivery for ADMIN-side events; no ADMIN immediate-wakeup change was made.
- Verify current motorcycle readiness/maintenance at pickup. The reviewed SQL explicitly checks readiness at confirmation, but does not repeat the same readiness/maintenance check on activation. ADMIN's independent enforcement is unknown.

## SECURITY

**Protected in the reviewed schema:** private documents, owner-scoped paths and booking ownership, active-admin access, guarded correction RPC, no customer RLS policy granting verification decision updates, server-side notification credentials, immutable event keys, verified customer recipient lookup, fixed admin recipient, no document/email attachments or raw OCR logging. Existing OCR workers use local models, bounded concurrency/time, in-memory images and no document disk cache. API summary tests confirm private OCR/check contents are not returned.

**Issue found — forged document metadata:** migration 015's owner INSERT policy checks owner/booking/path/object but does not require `status='submitted'` or `replaced_at is null`. The table accepts `approved`, so a crafted direct customer INSERT can label an upload approved. That is **not** an approved overall identity result and does not satisfy the component-based handover gate. Nevertheless, document status alone is not a trusted verification signal, and ADMIN must not promote it as one. A narrow [policy correction](document-insert-policy.prepared.sql) is prepared for isolated review/testing only; it was not applied or added to migration 027.

Additional limits: handover verification document-presence checks do not filter superseded/rejected rows; version-9 workflow guard explicitly skips legacy workflow versions; current unit readiness is not rechecked by the activation branch. These require an isolated database/ADMIN audit before asserting end-to-end release safety. This task did not alter production or those business-rule functions.

The prepared approval email checks overall and all required component approvals. Customers cannot approve the overall result via the prescreen endpoint, which ignores client-provided status fields. There is no new endpoint granting arbitrary automatic approval.

Cash on Pickup remains the only customer-facing payment method via the existing hard-disabled online-payment flag and server-route gates. PayMongo/Maya and online email dispatch remain disabled. Existing configured deposit snapshots/business rules are unchanged; confirm the production policy is cash-only ₱2,500 separately collected, because the legacy schema also supports an eligible-ID deposit option. No processing fee was added.

## TEST RESULTS

**106 tests passed across 12 focused files**, run with one worker to limit RAM:

- Notifications: templates, independent automatic-confirmation wording and narrow wakeup, owned-recipient protection, fixed admin mailbox, test-only routing, retry/idempotency/fingerprint handling, stale preparation, rejected recipient changes and payment-template disconnection.
- Verification: actual local Tesseract engine on a synthetic image; strict OCR extraction; image quality/missing documents/expiry/PDF/storage failure cases; matching OCR still cannot approve identity; ownership/origin/authentication and forged client status cannot mutate official results or expose OCR evidence.
- Booking/document/deposit: client validation, rental dates, file limits/types, separate configured ₱2,500 deposit calculation.
- Payments: hidden online choices and blocked checkout/method routes.

TypeScript (`tsc --noEmit --incremental false`) and focused ESLint passed. No full project build or broad suite was run. SQL assertions are static checks only, **not** PostgreSQL trigger/RLS/concurrency tests. No test used real customer documents or sent email. Existing synthetic email mobile/desktop layout evidence remains in the notification directory; changed message wording uses the same layout.

**Not tested this task:** deployed schema/configuration, real customer booking/upload/replacement sessions, SQL execution/rollback/concurrency, actual international confirmation, ADMIN UI, physical motorcycle release, real provider acceptance/delivery/retries or Gmail/Outlook inbox rendering. Do not describe the launch workflow as fully tested.

## REMAINING WORK

1. Decide the intended international confirmation rules before changing that existing workflow. Local automatic booking confirmation and its prepared email connection are preserved.
2. Finish/validate the in-house verifier's missing all-checks PASS criteria and secure evidence/result writer if automatic identity approval is required. Until then retain manual review; do not promote OCR success.
3. Implement an approved secure guest email-binding/verification flow; entered email alone does not meet the current recipient protection.
4. Test migration 027 and the separate document-insert policy patch against isolated PostgreSQL, including role forgery, replacement, status transitions, rollback, duplicate/concurrent notifications and handover guards. Resolve the readiness/current-document/legacy-record questions before launch.
5. Verify ADMIN review/status/deposit workflows and event settings; integrate real stored pickup instructions and approved review/admin URLs.
6. After testing, obtain explicit production migration/configuration approval; configure secure keys and reviewed event settings, install an approved scheduler, then perform safe-mailbox provider and inbox tests before allowing real sends.
7. Verify actual public-booking, storage, cash-only deposit and disabled-payment settings on the deployment through a separately authorized read-only check. No production configuration was assumed verified here.
