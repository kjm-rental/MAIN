# Public booking activation plan

## Current production state

- Public booking remains disabled.
- Business timezone and operating hours are Asia/Manila, every day from 08:00 through midnight.
- Started-24-hour duration and full-started-day pricing remain provisional.
- Customer requests require private identity and driver-license uploads, human verification, and administrator confirmation.
- Policy text and approval timestamps remain drafts until KJM explicitly approves them.
- Supabase anonymous sign-ins are currently disabled.
- The hosted database currently contains zero customer, booking, payment, verification-document, and inventory-hold rows.

## Current draft-policy gaps

- The accepted Philippine IDs list contains synthetic-test placeholders, not an approved production list.
- The Philippine licence policy and international licence policy are explicitly labelled development-only.
- The privacy notice is explicitly labelled development-only.
- The international policy source is populated, but management has not approved the policy derived from it.
- The retention policy and physical-unit hold duration must be reviewed in the authenticated KJM ADMIN settings screen because they are intentionally not publicly readable.
- `policies_approved_at` is null; no policy is represented as approved.

## Anonymous Auth protections

Before enabling anonymous sign-ins, configure Cloudflare Turnstile or hCaptcha in Supabase and pass a valid CAPTCHA token to `signInAnonymously`. Set the anonymous-user rate limit conservatively for initial launch (proposed: 10 sign-ins per hour per IP), monitor Auth growth, and define an administrator-run cleanup process for old anonymous users. Do not enable anonymous Auth before the CAPTCHA client and document-upload hardening migration are deployed.

## Required activation sequence

1. Migrations 014 and 015 are deployed. Review and approve migration 016 only when ready to authorize the dedicated synthetic tester account.
2. Configure Turnstile in Cloudflare and Supabase, deploy `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, verify failed/missing CAPTCHA tokens are rejected, set the anonymous-user limit to 10/hour/IP, and only then enable anonymous Supabase Auth. Public administrator signup must remain unavailable.
3. Approve the Philippine licence policy, international licence policy and source, privacy notice, retention policy, accepted ID list, duration rule, pricing rule, pending lifetime, and inventory-hold duration in KJM ADMIN.
4. Run the controlled synthetic suite with reserved `.invalid` email addresses and generated files visibly marked `SYNTHETIC TEST DOCUMENT`. Never use a real identity document.
5. Record evidence only for checks actually executed: booking submission and idempotency, inventory concurrency, pending expiry, operating hours, pricing, verification gate, private document isolation, rescheduling and maintenance conflicts, cancellation, handover, return, and status access.
6. Confirm Supabase Cron is expiring pending requests and releasing holds.
7. Have an administrator explicitly approve the complete policies and enable the regular public-booking switch in KJM ADMIN.

The database readiness trigger refuses public activation unless every required technical check has recorded passing evidence. Saving draft policies does not mark technical checks passed and does not enable booking.

## Synthetic data handling

The `is_test` columns on customers, bookings, and verification documents are retained as general test-data provenance fields. Record the exact UUIDs of every synthetic fixture, mark them as test data through an administrator-controlled database operation, and remove only those exact fixtures after evidence has been captured.

Migration 016 automates those markers for a dedicated, non-anonymous tester account authorized by an active administrator for no more than seven days. The administrator can revoke it immediately. After deployment: create the dedicated Auth account, authorize its UUID in KJM ADMIN Settings, sign in at `/booking-test`, and use only `.invalid` email addresses and documents visibly labelled `SYNTHETIC TEST DOCUMENT`.
