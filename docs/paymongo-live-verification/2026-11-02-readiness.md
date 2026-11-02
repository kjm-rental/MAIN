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

## State after the initial schema audit

`enabled=false`, `migration_verified=true`, `webhook_verified=false`, `reconciliation_verified=false`, `concurrency_verified=false`. Delivery settings still report `qrph_enabled=false`. Remaining flags were not asserted from empty recovery runs, diagnostics, or historic staging evidence.

This was a scoped payment history repair. Missing history for other post-022 migrations is not reconciled by this work; do not run a blanket `supabase db push` against production.

## Remaining

The owner reports there is no acceptance booking yet. Prepare an owner-controlled booking and a reviewed controlled activation path before creating a real hosted checkout. Verify actual provider delivery, rental/service-only amount, cash deposit exclusion, settlement and recovery, and duplicate/concurrent behavior. The owner completes any real payment. Do not fabricate passed verification flags or use an arbitrary customer booking as a fixture.

The existing staging report remains staging-only evidence. No real charge, refund, customer booking, or provider-paid event was created during the initial schema/recovery audit.

## Owner-paid PHP10 verification

The owner subsequently authorized a separate live verification payment capped at PHP10 and completed it themselves. Commit `0b5a9dc` adds an operator-only, single-session utility and a narrowly identified verification branch to the signed LIVE webhook. It cannot credit a booking, create rental receipts, or activate payment readiness. The claim is persisted before provider creation; repeated runs reuse the same session. Verification records remain in the ignored local tools directory.

The provider read-back confirmed exactly one paid LIVE PHP10 payment for session `cs_b5c751f83065bbe601062913`. The hosted page showed PHP10 total and no added fees. PayMongo's dashboard recorded event `evt_dEqEKQe9FwSxpqVaeJSeU4WX`, resource matching that session, as Success with zero retries at 09:14 Asia/Manila on 2026-11-02. This is authentic provider delivery, unlike the earlier synthetic diagnostic probes. No refund was issued.

`webhook_verified=true` was recorded based on this evidence, keeping new checkout creation disabled. Rental ledger settlement, recovery of a missed rental payment and runtime concurrency verification remain pending. This separate verification payment is not a motorcycle rental payment and does not prove those remaining paths.

The focused verification/webhook/payment run passed 18 tests; targeted ESLint and the project TypeScript check passed before deployment. The deployed verification handler also rejected the then-unpaid session before the owner paid, based on authoritative provider retrieval.

## Restricted booking, recovery and concurrency verification

The dedicated staging project was upgraded with its eleven missing post-026 migrations in a single transaction. Existing 029/030 installations were retained. An initial all-files attempt encountered an existing 029 function and rolled back; no partial installation was retained. No production migration DDL was executed.

`runtime-parity.sql` compared 186 payment-related function bodies/security settings, columns/defaults/nullability and constraints between production and staging; all matched. Results are retained in ignored `runtime-schema-parity.json`.

The first concurrency attempt encountered the CLI login-role startup race and failed without being counted as passing. Its fixture reservation was cancelled and staging creation was disabled. The harness now establishes the first connection and holds its database transaction while starting the competitor. Distinct backend IDs are recorded for preparation, claiming and settlement.

The corrected run passed 27 checks. It used synthetic staging customers and clearly labelled LIVE-STAGING reservations. Real provider transport was simulated for the booking reconciliation/webhook source integration; no second real charge was made.

- Pinned staging has synthetic fixtures and guest payment RPC.
- Registered fixture preserves rental rate and separate deposit.
- Concurrent preparation returns one intent on distinct backends.
- Exactly one concurrent provider creation claim.
- LIVE settlement rejects TEST provenance.
- Concurrent duplicate settlements succeed idempotently.
- One ledger credit, intent and attempt; deposit excluded.
- Different second payment cannot double-credit.
- Payment locks booked dates.
- Guest rental includes services and excludes cash deposit.
- Guest settlement supports null authenticated actor.
- Guest ledger credits saved rental plus services exactly once.
- Guest recovery retry is idempotent.
- Webhook identity is complete only after recorded completion.
- Reused webhook event with altered payload is rejected.
- Late payment requires review without ledger credit.
- Recovery fixture has a creation claim but no attached session.
- Current reconciliation source attaches and settles a lost creation response.
- Current webhook rejects invalid signatures before provider retrieval.
- Current webhook accepts delayed notification after cron-style recovery.
- Repeated webhook is skipped without a provider request or second settlement.
- Recovery and repeated notifications leave one rental/service credit.
- MAIN guest status data reports the saved booking paid.
- ADMIN status data exposes one verified receipt through its existing RLS.
- Online preparation excludes a concurrent cash charge.
- A concurrent cash charge excludes online preparation.
- Competing confirmations for the same motorcycle have one winner.

Cleanup cancelled this run's synthetic reservations, disabled staging live creation/QRPh, and kept staging notification delivery disabled. Synthetic receipts remain in staging as audit fixtures; production customer bookings and ledgers were not used as fixtures. The harness is pinned to the staging project.

Production activation: `activate-verified-qrph.sql` checked the existing migration/authentic-webhook verification and current settlement/guest-payment source fingerprints, recorded reconciliation/concurrency verification, enabled the live foundation and QRPh method, and inserted an audit entry with the precise evidence scope. The production read-back returned `live_ready=true` and `qrph_enabled=true`. Rental rates, booking approval rules and deposit policy were not edited.

Vercel's existing non-secret public/server activation variables were found false and updated to true for their existing Production and Preview scopes. Commit `72adae6` deployed successfully. Final production and localhost `/api/paymongo/methods` responses both returned `methods: [qrph]` and `onlineEnabled: true`; production delivery options returned `qrph_ready: true` and `qrph_enabled: true`. The local ADMIN public display flag was added and its server restarted. Public QRPh activation is complete; the scoped provider-transport and scheduler limitations below remain documented.

The GitHub recovery worker has passed a manual remote run; an automatic scheduled trigger had not appeared in Actions at the latest inspection. Scheduling remains best effort, so the manual recovery command/workflow remains available if a schedule is delayed. This limitation is distinct from the tested booking recovery code and authenticated endpoint access.
