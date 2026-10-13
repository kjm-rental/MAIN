# Local owner checkout

Use the existing MAIN project: `npm run dev:paymongo-test`, then open
http://localhost:3000/booking-test and select **Use authorized local test session**.
The server binds to loopback; the existing authorized TEST account is authenticated
server-side. Its credentials remain in an ignored private file. Authorization
expires after 24 hours; `node scripts/configure-local-owner-test.cjs` renews the
same TEST authorization and preserves public booking disabled.

This launcher reads `.env.paymongo-test.local`, verifies the pinned TEST project
and TEST keys, and leaves `.env.local` unchanged. Normal `npm run dev` uses the
original configuration and must not be used for TEST payment submissions.
The original catalog, images, rental prices and approved ₱2,500 cash-deposit
policy are used. Document review and pickup checks remain required.

## Current temporary webhook

https://snap-rise-sender-apps.trycloudflare.com/api/paymongo/webhook

Registered in PayMongo TEST for `checkout_session.payment.paid`. The webhook
secret is stored only in the private TEST environment. The tunnel gateway
exposes signed webhooks, authenticated reconciliation, and a non-settling return
redirect only. The application, sign-in and document routes are not exposed.

Run `npm run schedule:paymongo-test` to reconcile every five minutes while the
process is open; `npm run reconcile:paymongo-test` performs one pass.
Use `npm run check:paymongo-test` for configuration readiness.
The current app, gateway, tunnel and scheduler are already running.

The random hostname lasts only while the current Cloudflare process is running.
Restarting a quick tunnel requires updating the TEST origin and TEST webhook
URL, then restarting the TEST app. Never place secrets in scheduler arguments.

## Personal payment test

Complete the normal booking form, select Pay Online (QR Ph), then use PayMongo's
TEST payment simulator (`test_url`). **Do not scan or pay the QR code:** PayMongo
warns that TEST QR codes can still accept real money. Return to the booking
status page and wait for verified webhook/reconciliation settlement. A return
redirect does not prove payment. The ₱2,500 refundable deposit remains cash.

Hosted simulator payment and actual paid webhook delivery remain to be tested.
LIVE payments remain disabled; no migration 026 or production data writes were
performed during this local setup.
