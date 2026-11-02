# QRPh payment-first correction and inline QR

The previous guest finalization path confirmed domestic bookings before an online payment existed. The corrected flow reserves the physical unit with a pending booking and a bounded payment deadline. Canonical provider retrieval and ledger settlement happen before confirmation. Cash finalization retains its prior behavior; international bookings retain manual approval.

The payment-selection step now renders a QRPh PNG inside KJM. The server binds the existing checkout session's PaymentIntent, atomically claims QR generation, and attaches one QRPh PaymentMethod. GET polling only retrieves/reconciles. The browser receives the saved amount, deadline, booking/payment status and PNG; provider credentials and client keys stay on the server. Existing checkout sessions and the existing financial ledger remain the source of identity and accounting.

A signed `payment.paid` event looks up only a previously bound intent. It retrieves the canonical session and intent, validates the saved amount, currency, live mode, session/intent identity and payment ID, then uses the existing idempotent settlement path. The existing `checkout_session.payment.paid` subscription remains supported. Unrelated intents are ignored. Reconciliation also reads the bound intent so hosted-session payment-list delays do not conceal an inline payment.

Validation:

- Real PayMongo TEST-mode session/intent/method attach returned `consume_qr` and a PNG data URI. No test payment or additional live payment was made.
- Eight rollback-only staging checks exercised actual guest document registration, terms/finalization, pending inventory reservation, denied unpaid confirmation, paid confirmation, duplicate settlement, immutable intent binding, single QR-generation claim and unchanged cash finalization. Synthetic storage metadata existed only inside the rolled-back transaction; no identity documents were uploaded.
- All 51 focused payment/API/component tests and targeted lint passed; isolated production Turbopack build succeeded. Browser preview confirmed the PNG, saved amount and awaiting-payment copy render inside KJM. The temporary preview route was removed.

Deployment uses migration `202611020041_payment_first_inline_qrph.sql`, with source fingerprints for the seven replaced functions and atomic history recording. Do not replay the older installed-history repair script after this forward migration: its original function fingerprints intentionally no longer match.

New checkout creation was paused via `delivery_settings.qrph_enabled=false` while the correction was prepared. Existing webhook and reconciliation processing remained enabled. Reopen only after the forward migration, application deployment and webhook subscription are verified.

Production completion:

- All 30 management/recovery/concurrency staging checks passed, and cleanup completed with staging payments disabled.
- Migration 041 applied atomically with its history record after original-source and paused-creation checks. All 12 affected/new function bodies and security properties exactly match tested staging.
- Commit `17ea21d` deployed Ready as the current Production deployment on `kjmride.com`. The enabled provider webhook now subscribes to both `checkout_session.payment.paid` and `payment.paid`.
- A signed diagnostic for an unbound synthetic intent returned HTTP 200 `ignored: true`; an invalid signature returned 401. This verifies the deployed handler/configuration, not a real payment.
- The reported older PHP1,470 checkout was independently retrieved from PayMongo: expired, live, matching reference/amount, no paid payment. Its still-confirmed booking was corrected to cancelled in a locked transaction requiring no receipt or ledger payment and an expired unpaid checkout. History/audit record the reason. No refund or additional charge was created.
- Live readiness remained true and QRPh creation was reopened with the payment-before-confirmation trigger enabled. The previous PHP10 owner payment remains the only live verification charge; the new inline transport has not been paid with real money.
