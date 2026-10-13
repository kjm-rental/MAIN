# Owner-only Telegram notifications

## Connected code, not live delivery

ADMIN's existing transactional outbox and worker now deliver to the positive private
`TELEGRAM_OWNER_CHAT_ID` only. The previous group-chat setting is no longer used.
MAIN's webhook replies only to that same configured owner; commands reveal no bookings.
The existing ADMIN Telegram transport is reused; no booking actions or database logic changed.

- New requests and confirmations: saved booking/customer details, phone, recorded payment
  balance and verification status, Manila times, pesos, and an inline Admin booking button.
  Automatically confirmed bookings use the existing `booking_approved` event and are
  honestly labeled BOOKING CONFIRMED. No document approval is inferred.
- Cancellations from either application: existing database-triggered cancellation event,
  saved rental snapshot, recorded timestamp, and actor when identifiable. Free-text reasons
  stay in Admin because they can contain document numbers or identity information.
- Existing document-review and replacement-request events: report the actual stored
  verification state. This is not complete verification-change coverage.
- Pending: approved/rejected/other verification transitions and rescheduling with old/new
  timestamps. The existing outbox does not capture these events; implementing them safely
  requires a separate transactional event-capture task. No automatic verification was added.

Outbox unique event keys, leases, immutable request hashes and delivery receipts remain
unchanged. Telegram timeouts/ambiguous sends are not automatically resent; they require
review, because Telegram has no provider idempotency key. Exactly-once delivery is not
claimed. Missing owner configuration skips Telegram claims, retaining queued events.
The worker runs separately from bookings, so provider failures cannot block booking saves.
No private documents, document numbers, review notes or free-text cancellation reasons are sent.

## Configuration

MAIN server environment:

- Existing `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.
- `TELEGRAM_OWNER_CHAT_ID`: owner's positive private chat ID, never a group ID.

ADMIN server environment (the existing worker runs here):

- Same `TELEGRAM_BOT_TOKEN` and `TELEGRAM_OWNER_CHAT_ID`.
- `KJM_ADMIN_BASE_URL`: the externally reachable HTTPS Admin origin, without a path,
  credentials, query or fragment. Admin authentication remains required.
- Existing worker requirements: `SUPABASE_SERVICE_ROLE_KEY`, `NOTIFICATION_CRON_SECRET`
  (at least 32 characters), and the already configured public Supabase URL.
- To activate after review: `NOTIFICATIONS_MODE=live` and
  `NOTIFICATIONS_EXTERNAL_APPROVED=true`. Enable Telegram/event types through the
  existing authorized notification settings UI. No settings were changed in this task.

An external scheduler must invoke ADMIN's existing `POST /api/internal/notifications`
with `Authorization: Bearer <NOTIFICATION_CRON_SECRET>`. The existing worker processes
one Telegram row per invocation; choose a suitable cadence and monitor the queue.
No scheduler was created, no credentials copied, and no real messages sent in this task.

## Obtain the owner's chat ID

Have the owner send a unique `/start owner-setup-<unique-phrase>` to @KJMRentalBot.
For an active webhook, use a breakpoint in the secret-validated local webhook after
`updateSchema.safeParse`. Match the owner's unique text and inspect only
`parsed.data.message.chat.id`; confirm `chat.type` is `private`. Configure that positive
ID in both apps, then remove the breakpoint. Do not log or export complete webhook payloads.
For an unregistered webhook, Telegram's `getUpdates` response provides the same
`message.chat.id`. Do not disable an existing webhook just to poll without planning it.
Official API: https://core.telegram.org/bots/api#getupdates

## Safe testing

1. Run the focused mocked notification tests first; they make no real Telegram calls.
2. After configuring MAIN, the owner sends `/start`: only static text is returned.
   Another private chat should receive nothing. `/mybookings` never reveals bookings.
3. Keep ADMIN notification mode disabled until the intended owner ID and HTTPS Admin
   origin are checked. Synthetic outbox records are blocked from live providers.
4. Enable only the intended owner Telegram events and scheduler when ready. Observe
   queue receipts using the authorized Admin notification page. Do not replay ambiguous
   Telegram deliveries or create production bookings just to test.
