# Phase 5 — Booking and identity verification

## Scope

Phase 5 prepares a request-based booking workflow. A customer selects a published motorcycle model and rental period, supplies contact and licence information, accepts the privacy notice, and uploads documents to a private bucket. A submission is not a confirmed reservation. An administrator must review every required verification item and atomically assign an available physical unit before confirmation.

Payments, instant approval, automated legal eligibility decisions, and customer accounts beyond an anonymous authenticated session are outside this phase.

## Business policy gate

Public booking stays unavailable until an administrator configures all required business-owned values in `booking_settings`: operating hours in Asia/Manila, a partial-day pricing rule, accepted Philippine identity documents, a privacy notice, and the reviewed international-driving source. No default was invented for these decisions. Automatic document deletion is disabled until KJM approves a retention schedule and recovery process.

## Availability and concurrency

Availability uses individual active `motorcycle_units`, confirmed/active allocations, and maintenance ranges. The browser receives only a count. Pricing is recalculated in the database from the current model rate. Submitting does not hold a unit. Confirmation uses an administrator-only function, locks, conflict checks, and the existing exclusion constraint. Idempotency keys prevent duplicate booking records.

## Verification and documents

The `identity-verification` bucket is private. Customer access is constrained to the authenticated user's folder and matching ownership. Administrators receive short-lived signed links after authorization; access is recorded in the review trail. Public catalog queries cannot read customer, unit, booking, verification, or document records.

International visitors always require manual review. The system does not infer entitlement from free-text licence categories and does not treat an international driving permit as a replacement for a valid domestic licence.

## Legal references and unresolved decisions

Last reviewed: 2026-10-09.

- The [LTO Filipino Driver's Manual, Volume 1, second edition](https://lto.gov.ph/wp-content/uploads/2023/10/FDM-Vol.-1-2nd-Edition.pdf) states that a bona fide tourist with a valid foreign licence may operate in the Philippines for up to 90 days from arrival. KJM must manually assess the original licence, motorcycle category, entry date, and supporting documents. This implementation does not provide legal advice or automatic eligibility approval.
- The National Privacy Commission's [Data Privacy Act](https://privacy.gov.ph/data-privacy-act-/) and [implementing rules](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-%202012/) require transparency, legitimate purpose, proportionality, safeguards, retention no longer than necessary, and secure disposal. KJM must approve the final notice, lawful basis, access procedure, incident process, and retention schedule before production collection.

Still requiring KJM approval: operating hours, partial-day rule, accepted Philippine IDs, hold duration, privacy notice, document retention/deletion period, and operational wording for international visitors.

## Deployment prerequisites

1. Review migration `202610090008_phase5_booking_and_verification.sql`; apply it only after explicit approval.
2. Enable anonymous sign-ins in Supabase Auth for scoped guest identities. Do not enable public admin registration.
3. Configure `booking_settings` in the admin dashboard.
4. Test uploads, reviews, concurrent confirmation, handover, return, and denial cases outside production.
5. Confirm backup, retention, secure deletion, and incident-response procedures before collecting real identity documents.
