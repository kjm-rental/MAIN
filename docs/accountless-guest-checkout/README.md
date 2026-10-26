# Accountless guest checkout — migration 035 required

The application now sends booking submission, document upload and finalization to guest server endpoints. It no longer creates anonymous Supabase Auth users, reads a customer Auth email, sends verification links/OTPs, or asks customers to register/log in. ADMIN authentication is unchanged. Existing historical Auth-based bookings remain readable through their previous protected route.

## Apply before guest checkout can save real bookings

Review `supabase/migrations/202610260035_accountless_guest_checkout.sql` against the intended project and apply it through the approved migration workflow after the existing dependencies. **It has not been executed here.** Application tests use mocks; they do not prove a migrated guest booking or live email delivery works. No real booking or document was submitted during testing.

This migration:

- Reuses current quote/package/hourly pricing, extra selection, inventory holds, locks, conflict guards and local/international finalization rules.
- Creates one immutable guest contact/access binding per booking, with a random 256-bit browser secret stored only as a server-side hash. The secret lives in a Secure (production), HttpOnly, SameSite=Strict cookie, never in notification links or browser JavaScript. No customer account, password, access JWT or Auth user is created.
- Permits null Auth ownership for new guest documents and acceptance/confirmation records. Existing RLS policies and all admin review/handover guards stay in force. New public RPCs grant execute **only to service_role**, and verify server authorization and the booking access hash. The browser receives no storage URL or direct table access.
- Uses a new contact per booking so later checkout submissions cannot change an earlier recipient. Direct update/delete of the guest binding is prohibited by the existing immutable-record guard. Idempotent retries must match both the original access hash and full request fingerprint.
- Preserves private storage validation, immutable document metadata, current-decision invalidation, correction/reupload restrictions, OCR prescreening and review history. No OCR result approves identity.
- Extends the existing notification binding/context/prepare functions with an immutable `guest:<booking-id>` recipient. The current outbox, leases, request hashes, unique event keys, retry policy, eligibility and recipients for historical bookings remain intact. Pending → booking-request email; confirmed → confirmation email, as checked by the existing saved-status eligibility function. No delivery settings or credentials are modified, and no existing failed/queued/sent notifications are reset.
- Adds transactional guest rate limits (5 new checkouts per browser binding/hour, 60 globally/minute, 12 document uploads per booking/hour). If Turnstile is configured, the server also validates it; it is not an email/account verification step. If neither Turnstile key is configured, guest checkout relies on those database limits and does not show a broken challenge. Configure both existing `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` together if enabling that provider; optional `KJM_TURNSTILE_HOSTNAME` pins its hostname.

## Deployment/configuration

Use the existing server-only `SUPABASE_SERVICE_ROLE_KEY`, Supabase URL, Resend/Telegram workers and settings. Never put a service key in a public environment variable. No additional auth provider or customer Auth setting is required. Public-booking master enablement and operational policy gates remain unchanged; no tester identity bypass is used for guest creation.

The finalization route attempts a bounded existing Resend-worker wake after a successful commit. Failure does not undo the booking; the durable outbox keeps its existing scheduler/retry behavior. Emails use the checkout address saved by the server. No mailbox ownership claim is made. Guest message links expose only a booking identifier and still require the original browser cookie; another browser must contact KJM. Guest status returns only a small receipt projection, never document previews or internal customer data.

## Verification still required after approval of SQL

Review/run the SQL in the intended Supabase project, then verify guest submission and notification delivery using an explicitly authorized booking workflow. This task intentionally created no real test bookings, sent no test customer emails, uploaded no real identity documents and executed no SQL. Review table privileges and the prepared function definitions as part of migration approval. Until migration 035 is applied, the new server endpoints return friendly unavailable messages rather than falling back to Auth-based checkout or exposing database errors.
