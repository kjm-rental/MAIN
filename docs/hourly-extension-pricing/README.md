# Hourly extension pricing — migration 032 (not applied)

Apply only after reviewing `supabase/migrations/202610260032_hourly_extension_pricing.sql` against the intended project. This work did not execute SQL, change live rates, select a policy, create models, reprice saved bookings, activate payments, push, or deploy.

## Required owner steps

1. Review/apply migration 032 through the normal approved Supabase migration process, after migrations through 031. It adds a nullable hourly PHP rate, nullable maximum extra-hour policy, and a booking JSON pricing snapshot. Existing RLS/grants, submission/assignment routines, payment and deposit accounting remain in place.
2. Check the seeded model IDs/names and values. Eight exact active catalog matches are seeded only when their new hourly field is null. Daily/weekly/monthly rates are untouched. Honda Beat (₱50/hour) has no active catalog record and is not created. Aerox 155 (₱75/hour) does not match the existing “Aerox 160cc”; the user explicitly requested owner review, so that field remains unset.
3. In ADMIN → Settings → Booking settings, select **started 24 hours**, enter and save the hourly extension limit. **Blank preserves existing calculation.** Nothing opts in automatically. 0 bills every remainder as a complete period; 1–23 permits that many rounded-up extra hours. If a model has no hourly rate, it keeps the existing calculation even after policy activation.
4. Check/edit model hourly rates in ADMIN → Fleet → model → Pricing using the existing save action.
5. Review/run `supabase/tests/hourly_extension_pricing.sql` as the migration owner. It exercises pure arithmetic and writes no booking, model or settings records. Database regression tests were prepared but not executed during implementation.

## Billing rule chosen explicitly by saving the setting

Minimum duration is 24 hours, enforced by the server and date form. Compute complete 24-hour days using the cheapest combination of the daily, active 7-day and active 30-day rates covering at least that many days. Package validity must cover the rental dates. A cheaper covering package can be used even for fewer days. Existing rates themselves are never edited by the calculator.

Round a remaining fraction of an hour upward. If the rounded hours exceed the saved limit, bill the next complete day or cheaper package. Otherwise bill configured hourly rate × rounded extra hours, capped at the difference between the base price and that next complete-period price. Example, daily ₱700/hourly ₱70 and limit at least 5: 48h = ₱1,400; 53h = ₱1,750. With limit 2, 53h bills the next complete period instead (₱2,100 without package discounts). A 23h59m remainder rounds to 24 and is always a complete period.

Existing per-day extras continue using started-day pricing units; they are separate from the motorcycle hourly calculation. Security deposits remain separate from rental revenue. No client total is sent to or trusted by the server.

## Preservation and rollout

The deployed legacy calculator is renamed intact; new calculation delegates to it until a policy and model rate both exist. All existing callers still use the original function signature. The detailed V4 quote adds a snapshot, while V2/V3 deposit and submission APIs remain intact. MAIN falls back to the old quote API only for an absent V4 RPC, never for a validation/authorization error.

Only new bookings or explicit date/base-price changes get a snapshot. Editing fleet rates or settings does not touch existing bookings, payments, deposits or previously queued notifications. Historical bookings with no snapshot show their saved totals without inventing an hourly breakdown. Explicit rescheduling continues to request a fresh server quote, as before.

The notification trigger enriches only future outbox inserts with the saved breakdown. Delivery configuration and recipient rules are unchanged. Apply the migration and application changes before enabling the policy. Do not enable it while running older application code.

## Verification limits

TypeScript and focused application tests cover quote pass-through/fallback, 24-hour form validation, immutable snapshot display, migration preservation contracts and notification rendering. SQL arithmetic assertions cover 24h, 48h, 49h, 53h, weekly/monthly packages, limits, cap and fractional hours; these await execution after migration review. No live booking was created to test the feature.
