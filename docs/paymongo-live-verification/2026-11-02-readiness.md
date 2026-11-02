# PayMongo production readiness — 2026-11-02

Production project: `slevojynuumrvgiznmxk`; public origin: `https://kjmride.com`.

## Completed

- Removed the production Next.js override that forced live creation off; production test tooling remains disabled (commit `74c8f0a`).
- Authenticated PayMongo GET verified the existing webhook is enabled, LIVE, subscribed to `checkout_session.payment.paid`, and points at the public KJM webhook route. Its signing secret matches local configuration. No credential values were logged.
- A signed, non-payment diagnostic request returned HTTP 200 with `ignored: true` from the deployed webhook. This is a configuration/signature check, not authentic provider delivery or settlement evidence.
- Added the cursor-based GitHub Actions recovery worker, with repository Actions secret configuration, pinned checkout action, no overlapping runs, bounded pagination and count-only logs (commit `4963e11`). Its initial manually dispatched run succeeded: https://github.com/kjm-rental/MAIN/actions/runs/41370382732 . It processed zero checkouts. The workflow has a five-minute schedule; scheduled execution is best effort and may be delayed. The initial manual run does not establish that a scheduled trigger has fired.
- Four standalone worker tests pass, covering missing credentials, cursor pagination, review status accumulation, HTTP failures, malformed responses, repeated cursors and batch bounds. The earlier focused payment run passed 26 tests.
- Read-only owner SQL compared 25 installed payment, delivery, guest-checkout and notification function bodies against repository MD5 fingerprints. All match. Security-definer settings and empty search paths match, including the intentionally invoker-mode service reschedule guard.
- All eight expected payment/service triggers are enabled. The four live tables use forced RLS; no checked service-role direct insert/delete grant or anonymous/customer execute grant on live server RPCs exists. Guest settlement actor nullability and the `payment_actor_or_provider` constraint match. Checked live constraints are validated. There are no live checkout or receipt rows.
- Original migration history ended at 022 although later payment objects were present. After the checks above, an atomic guarded metadata-only transaction recorded 026, 037, 038 and 039 as already installed and set `migration_verified=true`. No migration DDL was replayed, booking altered or payment generated. The prepared equivalent repair transaction is `repair-installed-history.sql`.

## Current activation state

`enabled=false`, `migration_verified=true`, `webhook_verified=false`, `reconciliation_verified=false`, `concurrency_verified=false`. Delivery settings still report `qrph_enabled=false`. Remaining flags were not asserted from empty recovery runs, diagnostics, or historic staging evidence.

This was a scoped payment history repair. Missing history for other post-022 migrations is not reconciled by this work; do not run a blanket `supabase db push` against production.

## Remaining

The owner reports there is no acceptance booking yet. Prepare an owner-controlled booking and a reviewed controlled activation path before creating a real hosted checkout. Verify actual provider delivery, rental/service-only amount, cash deposit exclusion, settlement and recovery, and duplicate/concurrent behavior. The owner completes any real payment. Do not fabricate passed verification flags or use an arbitrary customer booking as a fixture.

The existing staging report remains staging-only evidence. No real charge, refund, customer booking, or provider-paid event was created during this work.
