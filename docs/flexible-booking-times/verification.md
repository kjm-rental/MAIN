# Flexible booking times — 6 November 2026

- Exact minute inputs retained; pickup, return, delivery and collection now default to 24/7 (Asia/Manila).
- Admin Settings → Booking rules adds dated pickup/return/both blocks, optional private notes, removal and a reset-to-24/7 button. Weekly hours remain editable.
- Blocks use a half-open interval: the start is unavailable, the end is available. Ongoing rentals can span closures; saved reservations are not rewritten.
- Private notes/admin identities are excluded from the public calendar RPC. Public roles cannot mutate blocks. Admin writes require active administrator membership and create audit entries.
- Shared quote guard and final booking insert/date-update trigger enforce closures; interval mutation and final writes use transaction advisory locks.
- Displayed duration uses actual complete days, hours and minutes. Existing hourly extension billing/minimum rental policies are preserved.

Validation: Main 460 tests; Admin 493 tests; both ESLint and production builds pass. Production rollback script verifies midnight/exact minutes, pickup/return/both scope, interval boundaries, spanning rentals, final booking write rejection and soft removal; all test writes rolled back. Anonymous block mutation rejected (42501). Public 24/7 settings and block RPC verified. Read-only production booking quote accepted 02:17–03:43 (next day); delivery/collection quote accepted the same times. No test orders, payments or customer notifications were created.

Migration `202611060044_flexible_booking_times.sql` applied to the shared production project and recorded in migration history. Source contains no changes to payment amounts, service fees, booking master switch or service enablement.

Live UI verification: Admin successfully added an overnight both-endpoint block for 10–11 November 2099 at 23:17–02:43, displayed it in Upcoming blocks, and removed it. Anonymous calendar response included only start_at/end_at/scope; a fresh query confirmed no active test block remained. Public production bundle contains the block-query integration and 24-hour label; authenticated Admin production displays the new controls.
