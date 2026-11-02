# QRPh payment-first correction and inline QR

The previous guest finalization path confirmed domestic bookings before an online payment existed. The corrected flow reserves the physical unit with a pending booking and a bounded payment deadline. Canonical provider retrieval and ledger settlement happen before confirmation. Cash finalization retains its prior behavior; international bookings retain manual approval.

The payment-selection step now renders a QRPh PNG inside KJM. The server binds the existing checkout session's PaymentIntent, atomically claims QR generation, and attaches one QRPh PaymentMethod. GET polling only retrieves/reconciles. The browser receives the saved amount, deadline, booking/payment status and PNG; provider credentials and client keys stay on the server. Existing checkout sessions and the existing financial ledger remain the source of identity and accounting.

A signed `payment.paid` event looks up only a previously bound intent. It retrieves the canonical session and intent, validates the saved amount, currency, live mode, session/intent identity and payment ID, then uses the existing idempotent settlement path. The existing `checkout_session.payment.paid` subscription remains supported. Unrelated intents are ignored. Reconciliation also reads the bound intent so hosted-session payment-list delays do not conceal an inline payment.

Validation:

- Real PayMongo TEST-mode session/intent/method attach returned `consume_qr` and a PNG data URI. No test payment or additional live payment was made.
- Six rollback-only staging checks exercised actual guest document registration, terms/finalization, pending inventory reservation, denied unpaid confirmation, paid confirmation, duplicate settlement and unchanged cash finalization. Synthetic storage metadata existed only inside the rolled-back transaction; no identity documents were uploaded.
- Focused payment/API/component tests and targeted lint passed; isolated production Turbopack build succeeded. Browser preview confirmed the PNG, saved amount and awaiting-payment copy render inside KJM. The temporary preview route was removed.

Deployment uses migration `202611020041_payment_first_inline_qrph.sql`, with source fingerprints for the seven replaced functions and atomic history recording. Do not replay the older installed-history repair script after this forward migration: its original function fingerprints intentionally no longer match.

New checkout creation was paused via `delivery_settings.qrph_enabled=false` while the correction was prepared. Existing webhook and reconciliation processing remained enabled. Reopen only after the forward migration, application deployment and webhook subscription are verified.
