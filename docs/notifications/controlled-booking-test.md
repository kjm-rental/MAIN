# One confirmation email from normal localhost checkout

No production SQL/security changes are needed for this controlled test. The normal MAIN connection remains the existing MAIN Supabase project. A booking placed here reserves actual inventory; the setup command does not create a booking or send mail.

In `.env.local`, keep `RESEND_ENABLED=false` and `NOTIFICATION_REMINDERS_ENABLED=false`. Keep the existing server-only `RESEND_API_KEY`; set `RESEND_TEST_RECIPIENT` privately to your own Gmail. `NOTIFICATION_DISPATCH_SECRET` has been generated locally; never expose it through NEXT_PUBLIC variables or browser requests.

From KJM MAIN:

```sh
node scripts/booking-email-test.cjs --status
node scripts/booking-email-test.cjs --arm
```

Arming sets only `RESEND_BOOKING_TEST_ENABLED=true` and `RESEND_BOOKING_TEST_AFTER` to now, valid for 60 minutes. Next dev reloads `.env.local`; restart `npm run dev -- --port 3000` if needed. Do not enable the database-wide Resend switch or call the general dispatcher for this test.

Open exactly `http://localhost:3000/motorcycles`. In the original browser session, complete one NEW eligible booking with the exact configured Gmail, available dates, required documents, and Cash on Pickup. Existing international/manual booking safeguards remain; a pending booking will not receive a confirmation. The success panel shows provider acceptance, disabled, ineligible, or held status. Check Gmail and Spam. Open the secure booking status page in the same browser if the original response was interrupted.

Then disarm:

```sh
node scripts/booking-email-test.cjs --disarm
```

The test gate only accepts development requests at localhost:3000 with a matching Host and same Origin, an authenticated owner, a real confirmed booking created after arming, and its stored contact email matching the server-controlled recipient. It does not trust an email or recipient supplied in the dispatch request. The controlled server allowlist is an operator-authorized test exception, not proof of general guest mailbox ownership.

A private `.resend-booking-test/attempt.json` is exclusively created and persisted before the provider call. One slot covers all bookings and concurrent requests. Ambiguous, rejected, and interrupted calls remain locked; do not delete this file or rearm to retry. The existing branded confirmation renderer is reused. No admin or identity email is sent by this gate. Normal outbox/identity events remain queued with general delivery off.

## General delivery remains disabled

Normal guest delivery uses Supabase Auth's verified email on the SAME booking owner, never the unverified contact field. When general delivery is explicitly enabled later, the confirmation/status panel offers anonymous guests an email-verification link/code flow. The PKCE callback rejects external redirects and account changes. Supabase Auth must allow anonymous account email upgrades, SMTP delivery, and `/auth/callback` redirect URLs for the intended site. None of those hosted settings were changed or tested by sending mail during setup.

The existing dispatcher remains bearer-protected and bounded, with DB eligibility, leases, request fingerprints and Resend idempotency. Existing verification/correction/risk triggers enqueue branded events. No recurring job was installed or activated. General operation still requires an explicitly approved database delivery switch, event preferences, and authenticated scheduling. Unverified guests must not be drained by that scheduler before binding (the current database worker treats an unbound recipient as invalid); `guest-email-binding-prepared.sql` prepares the narrow hold-until-bound fix and rechecks the stored contact against the verified Auth email. It is outside automatic migrations and was NOT applied; owner authorization and database validation are required before general production scheduling.

Keep the local attempt ledger: the MAIN worker reconciles its confirmed/ambiguous test against the booking confirmation rather than sending it twice on this host. Before any future deployment/general delivery, reconcile that booking's pending outbox confirmation and preserve the guard; a local ledger is not shared with another host. This setup does not claim production-wide delivery readiness or change production security.
